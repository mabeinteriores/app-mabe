-- Incremental quotation controls. Replaces existing SECURITY INVOKER functions;
-- existing ownership and EXECUTE privileges are preserved. No new grants or tables.
alter table public.camber_quotations add column if not exists control_previous text;
alter table public.camber_quotations add column if not exists control_reason text;
alter table public.camber_quotations add column if not exists control_version integer not null default 0;
alter table public.camber_quotations add column if not exists control_mutation uuid;

CREATE OR REPLACE FUNCTION public.camber_quotes_api(action text, payload jsonb, actor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare q public.camber_quotations%rowtype;r public.camber_quote_requests%rowtype;v public.camber_quote_versions%rowtype;
 po public.camber_purchase_orders%rowtype;v_participant jsonb;result jsonb;k jsonb;o jsonb;p jsonb;oi int;pi int;due timestamptz;st text;qid uuid;
begin
 if action not in ('lookup','submit','draft','revise','decline','supplier_file') then
  if actor is null or not exists(select 1 from public.profiles where id=actor and ativo and aprovado and (papel='admin' or 'projetos'=any(abas_permitidas))) then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 end if;
 if action='dashboard' then
  if payload ? 'page' or payload @> '{"summaryOnly":true}' then return public.camber_quotation_page(payload);end if;
  return public.camber_quotation_summary();
 end if;
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
   'clientPrices',coalesce((select jsonb_agg(jsonb_build_object('proposalId',pp->>'id','value',public.camber_remuneration_values(pp)->'client')) from public.kv_store ss,jsonb_array_elements(case when jsonb_typeof(ss.value)='array' then ss.value else '[]'::jsonb end) oo,jsonb_array_elements(coalesce(oo->'proposals','[]')) pp where ss.workspace='mabe' and ss.key='mabe-opps-v3-'||q.project_id and oo->>'id'=q.opportunity_id),'[]'),'financial',case when exists(select 1 from public.profiles where id=actor and papel='admin') then coalesce((select jsonb_agg(jsonb_build_object('proposalId',pp->>'id','rt',pp->'rt','rtTipo',pp->'rtTipo','value',pp->'value','quoteResponse',pp->'quoteResponse','remuneration',pp->'remuneration')) from public.kv_store ss,jsonb_array_elements(case when jsonb_typeof(ss.value)='array' then ss.value else '[]'::jsonb end) oo,jsonb_array_elements(coalesce(oo->'proposals','[]')) pp where ss.workspace='mabe' and ss.key='mabe-opps-v3-'||q.project_id and oo->>'id'=q.opportunity_id),'[]') else null end);
  end if;
  if action='reviewed' then update public.camber_quotations set reviewed_at=now() where id=q.id;return '{"ok":true}';end if;
  if action='workflow' then
   st=payload->>'state';
   if st is null or st not in ('DRAFT','AWAITING_SEND','IN_QUOTATION','AWAITING_SUPPLIERS','CLOSED','CANCELED','PAUSED','RESUME','ARCHIVED','TRASH','RESTORE') then raise exception 'Estado inválido.';end if;
   if payload ? 'mutationId' and q.control_mutation=(payload->>'mutationId')::uuid then return '{"ok":true}';end if;
   if (payload ? 'expectedVersion' and (payload->>'expectedVersion')::int is distinct from q.control_version)
     or (st in ('PAUSED','RESUME','CANCELED','ARCHIVED','TRASH','RESTORE') and not(payload ? 'expectedVersion')) then
     raise exception 'Esta cotação mudou. Atualize a tela antes de continuar.';
   end if;
   if q.selected_request_id is not null or exists(select 1 from public.camber_purchase_orders where quotation_id=q.id) then
     if st<>'ARCHIVED' and not(st='RESTORE' and q.workflow='ARCHIVED') then raise exception 'Cotação com fornecedor escolhido ou compra: somente arquivar ou restaurar.';end if;
   end if;
   if st in ('PAUSED','CANCELED') and (length(trim(coalesce(payload->>'reason','')))<3 or length(payload->>'reason')>1000) then raise exception 'Informe o motivo (3 a 1.000 caracteres).';end if;
   if st='PAUSED' then
     if q.state<>'OPEN' or q.workflow in ('DRAFT','PAUSED','CANCELED','ARCHIVED','TRASH') then raise exception 'Somente cotações em andamento podem ser pausadas.';end if;
   elsif st='CANCELED' then
     if q.workflow in ('CANCELED','ARCHIVED','TRASH') or (q.state='CLOSED' and q.workflow<>'PAUSED') then raise exception 'Esta cotação não pode ser cancelada nesta situação.';end if;
   elsif st='RESUME' then
     if q.workflow not in ('PAUSED','CANCELED') and q.state<>'CLOSED' or q.workflow in ('ARCHIVED','TRASH') then raise exception 'Esta cotação não está pausada, cancelada ou encerrada.';end if;
     due=(payload->>'expiresAt')::timestamptz;
     if due is null or due<=now() or due>now()+interval '90 days' then raise exception 'Defina um prazo futuro, de até 90 dias.';end if;
   elsif st='ARCHIVED' then
     if q.state<>'CLOSED' or q.workflow in ('PAUSED','ARCHIVED','TRASH') then raise exception 'Arquive somente cotações encerradas ou canceladas.';end if;
   elsif st='TRASH' then
     if q.workflow<>'DRAFT' or exists(select 1 from public.camber_quote_requests rr where rr.quotation_id=q.id and (rr.response is not null or rr.responded_at is not null))
       or exists(select 1 from public.camber_quote_versions vv join public.camber_quote_requests rr on rr.id=vv.request_id where rr.quotation_id=q.id) then raise exception 'Somente rascunhos sem propostas recebidas podem ir para a lixeira.';end if;
   elsif st='RESTORE' then
     if q.workflow not in ('ARCHIVED','TRASH') then raise exception 'Somente cotações arquivadas ou na lixeira podem ser restauradas.';end if;
   else
     if q.workflow in ('PAUSED','CANCELED','ARCHIVED','TRASH') or (q.state='CLOSED' and st<>'CLOSED') then raise exception 'Use Retomar ou Restaurar para esta cotação.';end if;
     if st='DRAFT' and exists(select 1 from public.camber_quote_requests where quotation_id=q.id and response is not null) then raise exception 'Cotação com proposta recebida não pode voltar a rascunho.';end if;
   end if;
   update public.camber_quotations set
     control_previous=case when st in ('ARCHIVED','TRASH') then q.workflow when st='RESTORE' then null else control_previous end,
     workflow=case when st='RESUME' then 'IN_QUOTATION' when st='RESTORE' then coalesce(q.control_previous,case when q.workflow='TRASH' then 'DRAFT' else 'CLOSED' end) else st end,
     state=case when st in ('PAUSED','CANCELED','CLOSED','ARCHIVED','TRASH','DRAFT') or st='RESTORE' then 'CLOSED' else 'OPEN' end,
     expires_at=case when st='RESUME' then due else expires_at end,
     control_reason=case when st in ('PAUSED','CANCELED') then trim(payload->>'reason') when st='RESUME' then null else control_reason end,
     control_version=control_version+1,control_mutation=(payload->>'mutationId')::uuid
     where id=q.id;
   if st='RESUME' then update public.camber_quote_requests set expires_at=due where quotation_id=q.id;end if;
   insert into public.camber_quote_events(quotation_id,event,actor) values(q.id,
     case st when 'PAUSED' then 'Cotação pausada' when 'RESUME' then 'Cotação retomada · Novo prazo: '||to_char(due at time zone 'America/Sao_Paulo','DD/MM/YYYY')
     when 'CANCELED' then 'Cotação cancelada' when 'ARCHIVED' then 'Cotação arquivada' when 'TRASH' then 'Cotação movida para a lixeira'
     when 'RESTORE' then 'Cotação restaurada · Recebimento continua suspenso' when 'CLOSED' then 'Cotação encerrada' else 'Situação alterada: '||st end
     ||case when st in ('PAUSED','CANCELED') then ' · Motivo: '||trim(payload->>'reason') else '' end,actor);
   return '{"ok":true}';
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
end $function$
;
CREATE OR REPLACE FUNCTION public.camber_quotation_summary()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 select coalesce(jsonb_agg(to_jsonb(z) order by z.created_at desc),'[]') from (
 select q.*, 'COT-'||extract(year from q.created_at at time zone 'America/Sao_Paulo')||'-'||lpad(q.number::text,5,'0') code,
 coalesce(pr->>'nome','Projeto indisponível') project_name,coalesce(pr->>'cliente',pr->>'nome','') client_name,
 coalesce(op->>'serv','Oportunidade indisponível') service,coalesce(op->>'resp',pf.nome,'') responsible,
 stats.invited,stats.received,stats.awaiting,stats.unviewed,stats.lowest,stats.suppliers,stats.last_response,
 case when q.workflow in ('PAUSED','CANCELED','ARCHIVED','TRASH','DRAFT') then q.workflow when q.state='CLOSED' then 'CLOSED'
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
$function$
;
CREATE OR REPLACE FUNCTION public.camber_quotes_v2(action text, payload jsonb, actor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r public.camber_quote_requests%rowtype;q public.camber_quotations%rowtype;res jsonb;data jsonb;k jsonb;o jsonb;p jsonb;f jsonb;ids jsonb; spec jsonb; oi int;pi int;pid text;oppid text;qi uuid;requestid uuid;st text;newopp jsonb;rows jsonb='[]';ev text;version_no int;
begin
 if action not in ('lookup','submit','draft','revise','decline','supplier_file') then
  if actor is null or not exists(select 1 from public.profiles where id=actor and ativo and aprovado and (papel='admin' or 'projetos'=any(abas_permitidas))) then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 end if;
 if payload ? 'token' then select * into r from public.camber_quote_requests where token=(payload->>'token')::uuid;
 elsif payload ? 'id' and action not in ('create','create_opportunity') then select * into r from public.camber_quote_requests where id=(payload->>'id')::uuid;end if;
 pid=coalesce(r.project_id,payload->>'projectId');oppid=coalesce(r.opportunity_id,payload->>'opportunityId');
 if pid is null then raise exception 'Pedido não encontrado.';end if;
 perform pg_advisory_xact_lock(hashtextextended('camber-quotes-'||pid,0));
 if r.id is not null then select * into r from public.camber_quote_requests where id=r.id for update;end if;
 if payload ? 'token' then
  if r.id is not null and r.active and r.status not in ('DECLINED','DISQUALIFIED','NOT_SELECTED') then
   select * into q from public.camber_quotations where id=r.quotation_id;
   if q.workflow in ('PAUSED','CANCELED','ARCHIVED','TRASH','DRAFT') then
    if action='lookup' then return jsonb_build_object('closed',true,'control_state',q.workflow);end if;
    raise exception 'Esta cotação não está recebendo propostas. Aguarde a liberação do escritório.';
   end if;
  end if;
  if r.id is null or not r.active or r.expires_at<=now() or r.status in ('DECLINED','DISQUALIFIED','NOT_SELECTED') then raise exception 'Link inválido, encerrado ou expirado.';end if;
  if exists(select 1 from public.camber_quotations where id=r.quotation_id and workflow='CANCELED') then raise exception 'Esta cotação foi cancelada.';end if;
  if exists(select 1 from public.camber_quotations where id=r.quotation_id and state='CLOSED') and action<>'lookup' then raise exception 'Esta cotação está encerrada.';end if;
 end if;
 if action in ('create_opportunity','add_participants') then
  qi=(payload->>'quotationId')::uuid;
  select * into q from public.camber_quotations where id=qi;
  if q.id is not null and action='create_opportunity' then
   if q.project_id<>pid or q.opportunity_id<>oppid then raise exception 'Identificador já utilizado.';end if;
   return jsonb_build_object('opportunityId',q.opportunity_id,'quotationId',qi);end if;
  if action='create_opportunity' then
   if not exists(select 1 from public.kv_store s,jsonb_array_elements(case when jsonb_typeof(s.value)='array' then s.value else '[]'::jsonb end) x where s.workspace='mabe' and s.key='mabe-projects-v3' and x->>'id'=pid) then raise exception 'Projeto não encontrado.';end if;
   select value into k from public.kv_store where workspace='mabe' and key='mabe-opps-v3-'||pid for update;k=coalesce(k,'[]');
   if exists(select 1 from jsonb_array_elements(k) x where x->>'id'=oppid) then raise exception 'Oportunidade já existente.';end if;
   if coalesce(trim(payload->>'service'),'')='' then raise exception 'Informe o serviço.';end if;
   spec=payload->'specification';
   insert into public.camber_quotations(id,project_id,opportunity_id,specification,expires_at,created_by) values(qi,pid,oppid,spec,(payload->>'expiresAt')::timestamptz,actor) returning * into q;
   newopp=jsonb_build_object('id',oppid::bigint,'serv',payload->>'service','titulo',spec->>'title','resp',payload->>'responsible','dt',current_date,'et','prospec','prob',20,'forn','a definir','val',0,'rt',0,'rtTipo','pct','proposals','[]'::jsonb,'quotationId',qi,'supplierMutation',gen_random_uuid());
   k=k||jsonb_build_array(newopp);
   insert into public.kv_store(workspace,key,value,updated_by) values('mabe','mabe-opps-v3-'||pid,k,actor) on conflict(workspace,key) do update set value=excluded.value,updated_at=clock_timestamp(),updated_by=actor;
  else
   if q.id is null or q.project_id<>pid or q.opportunity_id<>oppid or q.state='CLOSED' then raise exception 'Cotação indisponível.';end if;
  end if;
  ids=payload->'supplierIds';if jsonb_typeof(ids)<>'array' or jsonb_array_length(ids)=0 or jsonb_array_length(ids)>100 then raise exception 'Selecione de 1 a 100 fornecedores.';end if;
  for data in select * from jsonb_array_elements(ids) loop
   select value into k from public.kv_store where workspace='mabe' and key='mabe-opps-v3-'||pid for update;
   select x,(ord-1)::int into o,oi from jsonb_array_elements(k) with ordinality a(x,ord) where x->>'id'=oppid;
   if coalesce(o->>'selectedProposalId','')<>'' then raise exception 'Reabra a comparação para adicionar fornecedores.';end if;
   select x into f from public.kv_store s,jsonb_array_elements(case when jsonb_typeof(s.value)='array' then s.value else '[]'::jsonb end) x where s.workspace='mabe' and s.key='mabe-fornecedores-v1' and x->>'id'=(data#>>'{}');
   if f is null then raise exception 'Fornecedor não encontrado.';end if;
   select x into p from jsonb_array_elements(o->'proposals') x where x->>'supplierId'=f->>'id';
   if p is null then
    p=jsonb_build_object('id',gen_random_uuid()::text,'supplierId',f->>'id','name',f->>'nome','value',0,'rt',coalesce((f->>'rt')::numeric,0),'rtTipo','pct','days',null,'payment','','scope','','status','Convidado','quoteStatus','INVITED','invitedAt',now(),'city',f->>'cidade','state',f->>'uf');
    o=jsonb_set(o,'{proposals}',coalesce(o->'proposals','[]')||jsonb_build_array(p));
    o=o||jsonb_build_object('quotationId',qi,'supplierMutation',gen_random_uuid());
    if coalesce(o->>'favoriteProposalId','')='' then o=o||jsonb_build_object('favoriteProposalId',p->>'id');end if;
    update public.kv_store set value=jsonb_set(k,array[oi::text],o),updated_at=clock_timestamp(),updated_by=actor where workspace='mabe' and key='mabe-opps-v3-'||pid;
   end if;
   if not exists(select 1 from public.camber_quote_requests where quotation_id=qi and supplier_id=f->>'id') then
    res=public.camber_quotes_core('create',jsonb_build_object('id',gen_random_uuid(),'projectId',pid,'opportunityId',oppid,'proposalId',p->>'id','specification',q.specification,'expiresAt',q.expires_at),actor);
    update public.camber_quote_requests set quotation_id=qi where id=(res->>'id')::uuid;
    insert into public.camber_quote_events(request_id,quotation_id,event,actor) values((res->>'id')::uuid,qi,'Solicitação criada; link disponível para compartilhamento manual',actor);
   end if;
  end loop;
  return jsonb_build_object('opportunityId',oppid,'quotationId',qi);
 elsif action='create' then
  res=public.camber_quotes_core(action,payload,actor);
  select * into r from public.camber_quote_requests where id=(res->>'id')::uuid;
  if r.quotation_id is null then
   qi=gen_random_uuid();insert into public.camber_quotations(id,project_id,opportunity_id,specification,expires_at,created_by) values(qi,pid,oppid,r.specification,r.expires_at,actor);
   update public.camber_quote_requests set quotation_id=qi where id=r.id;
   insert into public.camber_quote_events(request_id,quotation_id,event,actor) values(r.id,qi,'Solicitação criada; link disponível para compartilhamento manual',actor);
  end if;
  return res;
 elsif action='list' then
  return coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc) from public.camber_quote_requests x where project_id=pid and opportunity_id=oppid),'[]');
 elsif action='bundle' then
  return jsonb_build_object('requests',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc) from public.camber_quote_requests x where project_id=pid and opportunity_id=oppid),'[]'),'quotations',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc) from public.camber_quotations x where project_id=pid and opportunity_id=oppid),'[]'),'events',coalesce((select jsonb_agg(jsonb_build_object('event',e.event,'at',e.created_at,'supplier',r.supplier_name) order by e.created_at desc) from public.camber_quote_events e left join public.camber_quote_requests r on r.id=e.request_id where e.quotation_id in(select id from public.camber_quotations where project_id=pid and opportunity_id=oppid)),'[]'));
 elsif action='versions' then return coalesce((select jsonb_agg(to_jsonb(v) order by version desc) from public.camber_quote_versions v where request_id=r.id),'[]');
 elsif action='quotation_state' then
  if exists(select 1 from public.camber_quotations where id=(payload->>'quotationId')::uuid and workflow in ('PAUSED','CANCELED','ARCHIVED','TRASH','DRAFT')) then raise exception 'Use os controles da central de cotações.';end if;
  st=payload->>'state';if st not in ('OPEN','CLOSED') then raise exception 'Estado inválido.';end if;
  update public.camber_quotations set state=st where id=(payload->>'quotationId')::uuid and project_id=pid and opportunity_id=oppid returning * into q;
  if q.id is null then raise exception 'Cotação não encontrada.';end if;
  insert into public.camber_quote_events(quotation_id,event,actor) values(q.id,case when st='OPEN' then 'Cotação reaberta' else 'Cotação encerrada' end,actor);return jsonb_build_object('ok',true);
 elsif action='lookup' then
  if r.viewed_at is null then update public.camber_quote_requests set viewed_at=now(),status=case when status='INVITED' then 'VIEWED' else status end where id=r.id returning * into r;
   insert into public.camber_quote_events(request_id,quotation_id,event) values(r.id,r.quotation_id,'Fornecedor visualizou o pedido');end if;
  res=public.camber_quotes_core('lookup',payload,null);
  res=jsonb_set(res,'{files}',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'size',f.size,'path',f.path)) from public.camber_quote_files f where request_id=r.id and (kind='project' or version=r.revision)),'[]'));
  return res||jsonb_build_object('draft',r.draft,'draft_revision',r.draft_revision,'revision',r.revision,'status',r.status,'closed',exists(select 1 from public.camber_quotations where id=r.quotation_id and state='CLOSED'));
 elsif action='draft' then
  if r.status='SUBMITTED' then raise exception 'Inicie uma nova versão para editar.';end if;
  if (payload->>'draft_revision')::int is distinct from r.draft_revision or (payload->>'revision')::int is distinct from r.revision then raise exception 'Este rascunho mudou em outra sessão. Reabra o link antes de editar.';end if;
  if jsonb_typeof(payload->'draft') is distinct from 'object' then raise exception 'Rascunho inválido.';end if;
  if octet_length((payload->'draft')::text)>100000 then raise exception 'Rascunho muito grande.';end if;
  update public.camber_quote_requests set draft=payload->'draft',draft_revision=draft_revision+1,status='IN_PROGRESS',started_at=coalesce(started_at,now()) where id=r.id returning * into r;
  if r.draft_revision=1 then insert into public.camber_quote_events(request_id,quotation_id,event) values(r.id,r.quotation_id,'Fornecedor iniciou preenchimento');end if;
  return jsonb_build_object('ok',true,'draft_revision',r.draft_revision);
 elsif action='revise' then
  if r.status<>'SUBMITTED' then return jsonb_build_object('ok',true);end if;
  update public.camber_quote_requests set revision=revision+1,status='IN_PROGRESS',draft=null,draft_revision=0 where id=r.id;
  insert into public.camber_quote_events(request_id,quotation_id,event) values(r.id,r.quotation_id,'Fornecedor iniciou nova versão');return jsonb_build_object('ok',true);
 elsif action='submit' then
  version_no=(payload->'response'->>'version')::int;
  if exists(select 1 from public.camber_quote_versions where request_id=r.id and version=version_no) then return jsonb_build_object('ok',true,'response',(select response from public.camber_quote_versions where request_id=r.id and version=version_no));end if;
  if version_no is null or version_no<>r.revision then raise exception 'Versão desatualizada. Reabra o link.';end if;
  res=public.camber_quotes_core('submit',payload,null);
  insert into public.camber_quote_versions(request_id,version,response) values(r.id,version_no,res->'response');
  update public.camber_quote_requests set status='SUBMITTED',draft=null where id=r.id;
  insert into public.camber_quote_events(request_id,quotation_id,event) values(r.id,r.quotation_id,'Proposta enviada · Versão '||version_no);return res;
 elsif action in ('decline','disqualify','revoke') then
  st=case action when 'decline' then 'DECLINED' when 'disqualify' then 'DISQUALIFIED' else 'DRAFT' end;
  update public.camber_quote_requests set status=st,active=false where id=r.id;
  insert into public.camber_quote_events(request_id,quotation_id,event,actor) values(r.id,r.quotation_id,case action when 'decline' then 'Fornecedor não participará' when 'disqualify' then 'Fornecedor desclassificado' else 'Link cancelado' end,actor);
  return jsonb_build_object('ok',true);
 elsif action='supplier_file' then
  if r.status='SUBMITTED' then raise exception 'Inicie uma nova versão para anexar PDF.';end if;
  if exists(select 1 from public.camber_quote_files where request_id=r.id and kind='proposal' and version=r.revision) then raise exception 'Já existe um PDF nesta versão.';end if;
  insert into public.camber_quote_files(id,request_id,name,path,size,kind,version) values((payload->>'fileId')::uuid,r.id,payload->>'name',r.id::text||'/'||(payload->>'fileId'),(payload->>'size')::bigint,'proposal',r.revision);
  return jsonb_build_object('ok',true);
 else return public.camber_quotes_core(action,payload,actor);
 end if;
end $function$
;
