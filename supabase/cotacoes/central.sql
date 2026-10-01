-- Incremental additions. Existing projects, suppliers and opportunities remain in kv_store.
create sequence if not exists public.camber_quotation_number;
alter table public.camber_quotations add column if not exists number bigint default nextval('public.camber_quotation_number');
alter table public.camber_quotations add column if not exists workflow text not null default 'IN_QUOTATION';
alter table public.camber_quotations add column if not exists estimated_value numeric(16,2) not null default 0;
alter table public.camber_quotations add column if not exists reviewed_at timestamptz;
alter table public.camber_quotations add column if not exists selected_request_id uuid references public.camber_quote_requests(id);
alter table public.camber_quote_requests add column if not exists negotiation_note text;
create table if not exists public.camber_purchase_orders(
 id uuid primary key default gen_random_uuid(),number bigint generated always as identity unique,
 quotation_id uuid not null unique references public.camber_quotations(id),
 proposal_version_id uuid not null references public.camber_quote_versions(id),
 state text not null default 'PENDING_APPROVAL',created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),approved_by uuid references auth.users(id),approved_at timestamptz,
 payment_state text not null default 'PENDING',expected_delivery date,confirmed_delivery date,
 delivery_state text not null default 'PENDING',received_at timestamptz,installation_state text not null default 'PENDING',
 delivery_events jsonb not null default '[]',documents jsonb not null default '[]'
);
alter table public.camber_purchase_orders enable row level security;
revoke all on public.camber_purchase_orders from anon,authenticated;
grant all on public.camber_purchase_orders to service_role;
grant usage,select on sequence public.camber_quotation_number,public.camber_purchase_orders_number_seq to service_role;
create index if not exists cq_purchase_version on public.camber_purchase_orders(proposal_version_id);
create index if not exists cq_quote_opportunity on public.camber_quotations(project_id,opportunity_id);
create index if not exists cq_quote_owner on public.camber_quotations(created_by);

-- A single projection powers the central, opportunity cards and menu badge.
create or replace function public.camber_quotation_summary() returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(z) order by z.created_at desc),'[]') from (
 select q.*, 'COT-'||extract(year from q.created_at at time zone 'America/Sao_Paulo')||'-'||lpad(q.number::text,5,'0') code,
 coalesce(pr->>'nome','Projeto indisponível') project_name,coalesce(pr->>'cliente',pr->>'nome','') client_name,
 coalesce(op->>'serv','Oportunidade indisponível') service,coalesce(op->>'resp',pf.nome,'') responsible,
 stats.invited,stats.received,stats.awaiting,stats.unviewed,stats.lowest,stats.suppliers,stats.last_response,
 case when q.workflow='CANCELED' then 'CANCELED' when q.state='CLOSED' then 'CLOSED'
 when q.workflow in ('DRAFT','AWAITING_SEND','NEGOTIATION') then q.workflow
 when q.expires_at<=now() then 'EXPIRED'
 when stats.invited>0 and stats.awaiting=0 and stats.received>0 then 'READY'
 when stats.received>0 then 'PARTIAL' when stats.invited>0 then 'AWAITING_SUPPLIERS' else 'IN_QUOTATION' end status,
 (q.state='OPEN' and q.workflow<>'CANCELED' and (stats.awaiting>0 or stats.received>0 and (q.reviewed_at is null or stats.last_response>q.reviewed_at) or q.expires_at<now()+interval '1 day')) attention
 from public.camber_quotations q left join public.profiles pf on pf.id=q.created_by
 left join lateral (select x pr from public.kv_store s,jsonb_array_elements(case when jsonb_typeof(s.value)='array' then s.value else '[]'::jsonb end) x where s.workspace='mabe' and s.key='mabe-projects-v3' and x->>'id'=q.project_id) pj on true
 left join lateral (select x op from public.kv_store s,jsonb_array_elements(case when jsonb_typeof(s.value)='array' then s.value else '[]'::jsonb end) x where s.workspace='mabe' and s.key='mabe-opps-v3-'||q.project_id and x->>'id'=q.opportunity_id) oo on true
 cross join lateral (select count(*)::int invited,count(*) filter(where response is not null and coalesce((response->>'version')::int,1)=revision)::int received,
 count(*) filter(where (response is null or coalesce((response->>'version')::int,1)<revision) and active and status not in ('DECLINED','DISQUALIFIED','NOT_SELECTED'))::int awaiting,
 count(*) filter(where viewed_at is null and active)::int unviewed,min((response->>'total')::numeric) lowest,
 coalesce(jsonb_agg(jsonb_build_object('id',supplier_id,'name',supplier_name)),'[]') suppliers,max(responded_at) last_response
 from public.camber_quote_requests where quotation_id=q.id) stats
 ) z
$$;
revoke all on function public.camber_quotation_summary() from public,anon,authenticated;
grant execute on function public.camber_quotation_summary() to service_role;

create or replace function public.camber_quotes_api(action text,payload jsonb,actor uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare q public.camber_quotations%rowtype;r public.camber_quote_requests%rowtype;v public.camber_quote_versions%rowtype;
 po public.camber_purchase_orders%rowtype;v_participant jsonb;result jsonb;k jsonb;o jsonb;p jsonb;oi int;pi int;due timestamptz;st text;qid uuid;
begin
 if action not in ('lookup','submit','draft','revise','decline','supplier_file') then
  if actor is null or not exists(select 1 from public.profiles where id=actor and ativo and aprovado and (papel='admin' or 'projetos'=any(abas_permitidas))) then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 end if;
 if action='dashboard' then return public.camber_quotation_summary();end if;
 if action='catalog' then return jsonb_build_object(
  'projects',coalesce((select value from public.kv_store where workspace='mabe' and key='mabe-projects-v3'),'[]'),
  'suppliers',coalesce((select value from public.kv_store where workspace='mabe' and key='mabe-fornecedores-v1'),'[]'),
  'opportunities',coalesce((select jsonb_agg(jsonb_build_object('projectId',substring(key from length('mabe-opps-v3-')+1),'opportunity',x)) from public.kv_store s,jsonb_array_elements(case when jsonb_typeof(s.value)='array' then s.value else '[]'::jsonb end) x where workspace='mabe' and key like 'mabe-opps-v3-%'),'[]'),
  'responsibles',coalesce((select jsonb_agg(nome) from public.profiles where ativo and aprovado),'[]'));end if;
 if action='purchases' then
  return coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at desc) from (
   select pp.*,vv.response,rr.supplier_name,rr.project_name,rr.service,rr.project_id,rr.opportunity_id,rr.id request_id,
   'PC-'||lpad(pp.number::text,5,'0') code from public.camber_purchase_orders pp
   join public.camber_quote_versions vv on vv.id=pp.proposal_version_id join public.camber_quote_requests rr on rr.id=vv.request_id
  ) b),'[]');
 end if;
 if action='new_quotation' then
  qid=(payload->>'quotationId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('camber-quotes-'||(payload->>'projectId'),0));
  select * into q from public.camber_quotations where id=qid;
  if q.id is not null then
   if q.project_id<>payload->>'projectId' or q.opportunity_id<>payload->>'opportunityId' then raise exception 'Identificador já utilizado.';end if;
   return jsonb_build_object('quotationId',q.id,'opportunityId',q.opportunity_id);
  end if;
  if not exists(select 1 from public.kv_store s,jsonb_array_elements(case when jsonb_typeof(s.value)='array' then s.value else '[]'::jsonb end) x where workspace='mabe' and key='mabe-opps-v3-'||(payload->>'projectId') and x->>'id'=payload->>'opportunityId') then raise exception 'Oportunidade não encontrada.';end if;
  insert into public.camber_quotations(id,project_id,opportunity_id,specification,expires_at,created_by,estimated_value)
   values(qid,payload->>'projectId',payload->>'opportunityId',payload->'specification',(payload->>'expiresAt')::timestamptz,actor,coalesce((payload->>'estimatedValue')::numeric,0)) returning * into q;
  return public.camber_quotes_v2('add_participants',payload,actor);
 end if;
 if action in ('detail','negotiate','select_supplier','purchase','deadline','workflow','reviewed') then
  select * into q from public.camber_quotations where id=(payload->>'quotationId')::uuid;
  if q.id is null then raise exception 'Cotação não encontrada.';end if;
  perform pg_advisory_xact_lock(hashtextextended('camber-quotes-'||q.project_id,0));
  select * into q from public.camber_quotations where id=q.id for update;
  if action='detail' then
   return jsonb_build_object('quotation',(select x from jsonb_array_elements(public.camber_quotation_summary()) x where x->>'id'=q.id::text),
   'requests',coalesce((select jsonb_agg(to_jsonb(rr) order by rr.created_at) from public.camber_quote_requests rr where quotation_id=q.id),'[]'),
   'versions',coalesce((select jsonb_agg(to_jsonb(vv) order by vv.version) from public.camber_quote_versions vv join public.camber_quote_requests rr on rr.id=vv.request_id where rr.quotation_id=q.id),'[]'),
   'events',coalesce((select jsonb_agg(jsonb_build_object('event',e.event,'at',e.created_at,'supplier',rr.supplier_name,'actor',pf.nome) order by e.created_at desc) from public.camber_quote_events e left join public.camber_quote_requests rr on rr.id=e.request_id left join public.profiles pf on pf.id=e.actor where e.quotation_id=q.id),'[]'),
   'purchase',(select id from public.camber_purchase_orders where quotation_id=q.id),
   'financial',case when exists(select 1 from public.profiles where id=actor and papel='admin') then coalesce((select jsonb_agg(jsonb_build_object('proposalId',pp->>'id','rt',pp->'rt','rtTipo',pp->'rtTipo')) from public.kv_store ss,jsonb_array_elements(case when jsonb_typeof(ss.value)='array' then ss.value else '[]'::jsonb end) oo,jsonb_array_elements(coalesce(oo->'proposals','[]')) pp where ss.workspace='mabe' and ss.key='mabe-opps-v3-'||q.project_id and oo->>'id'=q.opportunity_id),'[]') else null end);
  end if;
  if action='reviewed' then update public.camber_quotations set reviewed_at=now() where id=q.id;return '{"ok":true}';end if;
  if action='workflow' then
   st=payload->>'state';if st not in ('DRAFT','AWAITING_SEND','IN_QUOTATION','AWAITING_SUPPLIERS','CLOSED','CANCELED') then raise exception 'Estado inválido.';end if;
   if q.selected_request_id is not null then raise exception 'Cotação já tem fornecedor selecionado.';end if;
   update public.camber_quotations set workflow=st,state=case when st in ('CLOSED','CANCELED') then 'CLOSED' else 'OPEN' end where id=q.id;
   insert into public.camber_quote_events(quotation_id,event,actor) values(q.id,'Situação alterada: '||st,actor);return '{"ok":true}';
  end if;
  if action='purchase' then
   select * into po from public.camber_purchase_orders where quotation_id=q.id;if po.id is not null then return to_jsonb(po);end if;
   select * into r from public.camber_quote_requests where id=q.selected_request_id and status='SELECTED';
   select * into v from public.camber_quote_versions where request_id=r.id order by version desc limit 1;
   if v.id is null then raise exception 'Selecione uma proposta recebida antes de gerar a compra.';end if;
   insert into public.camber_purchase_orders(quotation_id,proposal_version_id,created_by,expected_delivery) values(q.id,v.id,actor,(v.response->>'delivery')::date) returning * into po;
   insert into public.camber_quote_events(quotation_id,event,actor) values(q.id,'Pedido de compra gerado: PC-'||lpad(po.number::text,5,'0'),actor);return to_jsonb(po);
  end if;
  if q.state='CLOSED' then raise exception 'Cotação encerrada.';end if;
  if action='deadline' then
   due=(payload->>'expiresAt')::timestamptz;if due<=now() or due>now()+interval '90 days' then raise exception 'Prazo deve estar entre hoje e 90 dias.';end if;
   update public.camber_quotations set expires_at=due where id=q.id;
   update public.camber_quote_requests set expires_at=due where quotation_id=q.id;
   insert into public.camber_quote_events(quotation_id,event,actor) values(q.id,'Prazo alterado para '||to_char(due at time zone 'America/Sao_Paulo','DD/MM/YYYY'),actor);return '{"ok":true}';
  end if;
  if action='negotiate' then
   if jsonb_typeof(payload->'requestIds')<>'array' or jsonb_array_length(payload->'requestIds')=0 then raise exception 'Selecione os fornecedores.';end if;
   if length(coalesce(payload->>'note',''))>3000 then raise exception 'Mensagem muito longa.';end if;
   for v_participant in select distinct value from jsonb_array_elements(payload->'requestIds') loop
    select * into r from public.camber_quote_requests where id=(v_participant#>>'{}')::uuid and quotation_id=q.id for update;
    if r.id is null or r.status<>'SUBMITTED' then raise exception 'Selecione somente propostas recebidas.';end if;
    update public.camber_quote_requests set revision=revision+1,status='IN_PROGRESS',draft=null,draft_revision=0,negotiation_note=payload->>'note',active=true where id=r.id;
    insert into public.camber_quote_events(request_id,quotation_id,event,actor) values(r.id,q.id,'Revisão solicitada · Rodada '||(r.revision+1)||': '||coalesce(payload->>'note',''),actor);
   end loop;
   update public.camber_quotations set workflow='NEGOTIATION' where id=q.id;return '{"ok":true}';
  end if;
  if action='select_supplier' then
   select * into r from public.camber_quote_requests where id=(payload->>'requestId')::uuid and quotation_id=q.id and status='SUBMITTED';
   if r.id is null then raise exception 'Escolha uma proposta recebida e finalizada.';end if;
   select value into k from public.kv_store where workspace='mabe' and key='mabe-opps-v3-'||q.project_id for update;
   select xx,(ord-1)::int into o,oi from jsonb_array_elements(k) with ordinality z(xx,ord) where xx->>'id'=q.opportunity_id;
   if coalesce(o->>'selectedProposalId','')<>'' then raise exception 'A oportunidade já tem fornecedor escolhido.';end if;
   select xx,(ord-1)::int into p,pi from jsonb_array_elements(o->'proposals') with ordinality z(xx,ord) where xx->>'id'=r.proposal_id;
   if p is null then raise exception 'Fornecedor removido da oportunidade.';end if;
   -- Chosen terms must come from this quotation, not from another round/quotation cache.
   p=p||jsonb_build_object('value',r.response->'total','days',r.response->'days','payment',r.response->'payment','scope',r.response->'scope','quoteResponse',r.response,'quoteRequestId',r.id);
   o=jsonb_set(o,array['proposals',pi::text],p)||jsonb_build_object('selectedProposalId',r.proposal_id,'favoriteProposalId',r.proposal_id,'val',r.response->'total','forn',r.supplier_name,'et','win','prob',100,'rt',p->'rt','rtTipo',p->'rtTipo','supplierMutation',gen_random_uuid());
   update public.kv_store set value=jsonb_set(k,array[oi::text],o),updated_at=clock_timestamp(),updated_by=actor where workspace='mabe' and key='mabe-opps-v3-'||q.project_id;
   update public.camber_quote_requests set status=case when id=r.id then 'SELECTED' else 'NOT_SELECTED' end where quotation_id=q.id;
   update public.camber_quotations set selected_request_id=r.id,state='CLOSED',workflow='CLOSED' where id=q.id;
   insert into public.camber_quote_events(request_id,quotation_id,event,actor) values(r.id,q.id,'Fornecedor selecionado: '||r.supplier_name,actor);return '{"ok":true}';
  end if;
 end if;
 result=public.camber_quotes_v2(action,payload,actor);
 if action='lookup' then
  select * into r from public.camber_quote_requests where token=(payload->>'token')::uuid;
  return result||jsonb_build_object('negotiation_note',r.negotiation_note);
 end if;
 if action='create_opportunity' then update public.camber_quotations set estimated_value=coalesce((payload->>'estimatedValue')::numeric,0) where id=(result->>'quotationId')::uuid;end if;
 return result;
end $$;
revoke all on function public.camber_quotes_api(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.camber_quotes_api(text,jsonb,uuid) to service_role;
