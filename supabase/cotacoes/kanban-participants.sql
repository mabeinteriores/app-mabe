-- Current participants and responses for quotation cards; history remains in the detail.
create or replace function public.camber_quotation_summary() returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(z) order by z.created_at desc),'[]') from (
 select q.*, 'COT-'||extract(year from q.created_at at time zone 'America/Sao_Paulo')||'-'||lpad(q.number::text,5,'0') code,
 coalesce(pr->>'nome','Projeto indisponível') project_name,coalesce(pr->>'cliente',pr->>'nome','') client_name,
 coalesce(op->>'serv','Oportunidade indisponível') service,coalesce(op->>'resp',pf.nome,'') responsible,
 stats.invited,stats.received,stats.awaiting,stats.unviewed,stats.lowest,stats.suppliers,stats.last_response,
 case when q.workflow='CANCELED' then 'CANCELED' when q.state='CLOSED' then 'CLOSED'
 when q.workflow in ('DRAFT','AWAITING_SEND') then q.workflow
 when q.expires_at<=now() and stats.awaiting>0 then 'EXPIRED'
 when q.workflow='NEGOTIATION' then q.workflow
 when stats.invited>0 and stats.awaiting=0 and stats.received>0 then 'READY'
 when stats.received>0 then 'PARTIAL' when stats.invited>0 then 'AWAITING_SUPPLIERS' else 'IN_QUOTATION' end status,
 (q.state='OPEN' and q.workflow<>'CANCELED' and (stats.awaiting>0 or stats.received>0 and (q.reviewed_at is null or stats.last_response>q.reviewed_at))) attention
 from public.camber_quotations q left join public.profiles pf on pf.id=q.created_by
 left join lateral (select x pr from public.kv_store s,jsonb_array_elements(case when jsonb_typeof(s.value)='array' then s.value else '[]'::jsonb end) x where s.workspace='mabe' and s.key='mabe-projects-v3' and x->>'id'=q.project_id) pj on true
 left join lateral (select x op from public.kv_store s,jsonb_array_elements(case when jsonb_typeof(s.value)='array' then s.value else '[]'::jsonb end) x where s.workspace='mabe' and s.key='mabe-opps-v3-'||q.project_id and x->>'id'=q.opportunity_id) oo on true
 cross join lateral (select count(*)::int invited,count(*) filter(where response is not null and coalesce((response->>'version')::int,1)=revision)::int received,
 count(*) filter(where (response is null or coalesce((response->>'version')::int,1)<revision) and active and status not in ('DECLINED','DISQUALIFIED','NOT_SELECTED'))::int awaiting,
 count(*) filter(where viewed_at is null and active)::int unviewed,min((response->>'total')::numeric) filter(where response is not null and coalesce((response->>'version')::int,1)=revision) lowest,
 coalesce(jsonb_agg(jsonb_build_object('id',supplier_id,'name',supplier_name,'status',status,'responded',response is not null and coalesce((response->>'version')::int,1)=revision,'awaiting',(response is null or coalesce((response->>'version')::int,1)<revision) and active and status<>'NOT_SELECTED') order by created_at,id),'[]') suppliers,max(responded_at) last_response
 from public.camber_quote_requests where quotation_id=q.id and status not in ('DISQUALIFIED','DECLINED','DRAFT')) stats
 ) z
$$;
revoke all on function public.camber_quotation_summary() from public,anon,authenticated;
grant execute on function public.camber_quotation_summary() to service_role;
