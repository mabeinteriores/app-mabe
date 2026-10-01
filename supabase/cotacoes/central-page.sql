-- Read-only pagination over the existing canonical projection. No new tables.
-- Called only after camber_quotes_api validates the internal actor.
create or replace function public.camber_quotation_page(payload jsonb default '{}')
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
with opts as (
 select greatest(1,coalesce((payload->>'page')::int,1)) page,
 least(100,greatest(1,coalesce((payload->>'pageSize')::int,25))) size,
 coalesce(payload->'filters','{}') f, coalesce(payload->>'quick','all') quick,
 coalesce(payload->>'sort','attention') sort,coalesce(payload->>'direction','asc') direction,
 (now() at time zone 'America/Sao_Paulo')::date today
), base as materialized (
 select x-'specification' q, x->>'state'='OPEN' and x->>'status'<>'CANCELED' is_open,
 (x->>'awaiting')::int>0 pending,
 ((x->>'expires_at')::timestamptz at time zone 'America/Sao_Paulo')::date due_day,
 ((x->>'created_at')::timestamptz at time zone 'America/Sao_Paulo')::date created_day
 from jsonb_array_elements(public.camber_quotation_summary()) x
), flags as materialized (
 select b.*,is_open and pending and (q->>'expires_at')::timestamptz<=now() late,
 is_open and pending and due_day=o.today due,
 is_open and (q->>'received')::int>0 and (q->>'reviewed_at' is null or (q->>'last_response')::timestamptz>(q->>'reviewed_at')::timestamptz) fresh
 from base b cross join opts o
), filtered as materialized (
 select b.*,case when late then 0 when due then 1 when q->>'status'='READY' then 2
 when q->>'status'='PARTIAL' then 3 when is_open then 4 else 5 end priority
 from flags b cross join opts o
 where (o.quick='all' or o.quick='awaiting' and is_open and pending or o.quick='ready' and q->>'status'='READY'
 or o.quick='due' and due or o.quick='late' and late or o.quick='closed' and q->>'state'='CLOSED'
 or o.quick='unviewed' and is_open and (q->>'unviewed')::int>0)
 and (coalesce(o.f->>'search','')='' or position(
 translate(lower(o.f->>'search'),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc') in
 translate(lower(concat_ws(' ',q->>'code',q->>'project_name',q->>'client_name',q->>'service',
 (select string_agg(s->>'name',' ') from jsonb_array_elements(q->'suppliers') s))),
 'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'))>0)
 and not exists(select 1 from jsonb_each_text(o.f) f where f.key in ('project_name','client_name','service','responsible','status','state') and f.value<>'' and coalesce(q->>f.key,'')<>f.value)
 and (coalesce(o.f->>'supplier','')='' or exists(select 1 from jsonb_array_elements(q->'suppliers') s where s->>'name'=o.f->>'supplier'))
 and (coalesce(o.f->>'projectId','')='' or q->>'project_id'=o.f->>'projectId')
 and (coalesce(o.f->>'opportunityId','')='' or q->>'opportunity_id'=o.f->>'opportunityId')
 and (coalesce(o.f->>'deadline','')='' or due_day<=(o.f->>'deadline')::date)
 and (coalesce(o.f->>'from','')='' or created_day>=(o.f->>'from')::date)
 and (coalesce(o.f->>'to','')='' or created_day<=(o.f->>'to')::date)
), ranked as (
 select q,row_number() over(order by
 case when o.sort='attention' then priority end,
 case when o.direction='asc' and o.sort='deadline' then (q->>'expires_at')::timestamptz end asc nulls last,
 case when o.direction='desc' and o.sort='deadline' then (q->>'expires_at')::timestamptz end desc nulls last,
 case when o.direction='asc' and o.sort='created' then (q->>'created_at')::timestamptz end asc nulls last,
 case when o.direction='desc' and o.sort='created' then (q->>'created_at')::timestamptz end desc nulls last,
 case when o.direction='asc' and o.sort in ('value','responses') then (q->>case o.sort when 'value' then 'estimated_value' else 'received' end)::numeric end asc nulls last,
 case when o.direction='desc' and o.sort in ('value','responses') then (q->>case o.sort when 'value' then 'estimated_value' else 'received' end)::numeric end desc nulls last,
 case when o.direction='asc' and o.sort in ('project','status') then q->>case o.sort when 'project' then 'project_name' else 'status' end end asc nulls last,
 case when o.direction='desc' and o.sort in ('project','status') then q->>case o.sort when 'project' then 'project_name' else 'status' end end desc nulls last,
 (q->>'created_at')::timestamptz desc,q->>'id') rn
 from filtered cross join opts o
), totals as (select count(*) n from filtered), paging as (
 select least(o.page,greatest(1,ceil(t.n::numeric/o.size)::int)) page,o.size,t.n from opts o cross join totals t
), facets as (
 select coalesce(jsonb_object_agg(key,vals),'{}') data from (
 select key,jsonb_agg(value order by value) vals from (
 select distinct v.key,v.value from flags b cross join lateral jsonb_each_text(b.q) v
 where v.key in ('project_name','client_name','service','responsible','status') and v.value<>''
 union select distinct 'supplier',s->>'name' from flags b cross join lateral jsonb_array_elements(b.q->'suppliers') s
 ) v group by key) d
), kpis as (
 select jsonb_build_object('open',count(*) filter(where is_open),'awaiting',count(*) filter(where is_open and pending),
 'ready',count(*) filter(where q->>'status'='READY'),'due',count(*) filter(where due),'late',count(*) filter(where late),
 'value',coalesce(sum((q->>'estimated_value')::numeric) filter(where is_open),0),
 'attention',count(*) filter(where (q->>'attention')::boolean),
 'unviewed',coalesce(sum((q->>'unviewed')::int) filter(where is_open),0)) data from flags
)
select case when payload @> '{"summaryOnly":true}' then jsonb_build_object('kpis',k.data) else
 jsonb_build_object('rows',coalesce((select jsonb_agg(r.q order by r.rn) from ranked r where r.rn>(p.page::bigint-1)*p.size and r.rn<=p.page::bigint*p.size),'[]'),
 'total',p.n,'page',p.page,'pageSize',p.size,'facets',f.data,'kpis',k.data) end
 from paging p cross join facets f cross join kpis k;
$$;
revoke all on function public.camber_quotation_page(jsonb) from public,anon,authenticated;
grant execute on function public.camber_quotation_page(jsonb) to service_role;
