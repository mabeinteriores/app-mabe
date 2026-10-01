create table if not exists public.camber_quotations(
 id uuid primary key,project_id text not null,opportunity_id text not null,specification jsonb not null,
 expires_at timestamptz not null,state text not null default 'OPEN' check(state in ('OPEN','CLOSED')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(project_id,opportunity_id,id)
);
alter table public.camber_quotations enable row level security;
revoke all on public.camber_quotations from anon,authenticated;grant all on public.camber_quotations to service_role;
alter table public.camber_quote_requests add column if not exists quotation_id uuid references public.camber_quotations(id);
alter table public.camber_quote_requests add column if not exists status text not null default 'INVITED';
alter table public.camber_quote_requests add column if not exists draft jsonb;
alter table public.camber_quote_requests add column if not exists draft_revision integer not null default 0;
alter table public.camber_quote_requests add column if not exists revision integer not null default 1;
alter table public.camber_quote_requests add column if not exists viewed_at timestamptz;
alter table public.camber_quote_requests add column if not exists started_at timestamptz;
alter table public.camber_quote_files add column if not exists kind text not null default 'project';
alter table public.camber_quote_files add column if not exists version integer;
create table if not exists public.camber_quote_versions(
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.camber_quote_requests(id),
 version integer not null,response jsonb not null,submitted_at timestamptz not null default now(),
 unique(request_id,version)
);
create table if not exists public.camber_quote_events(
 id bigint generated always as identity primary key,request_id uuid references public.camber_quote_requests(id),
 quotation_id uuid references public.camber_quotations(id),event text not null,actor uuid,created_at timestamptz not null default now()
);
create index if not exists cq_events_quote on public.camber_quote_events(quotation_id,created_at);
create index if not exists cq_events_request on public.camber_quote_events(request_id,created_at);
create index if not exists cq_requests_quote on public.camber_quote_requests(quotation_id);
create unique index if not exists cq_requests_supplier on public.camber_quote_requests(quotation_id,supplier_id);
create table if not exists public.camber_quote_item_selections(
 quotation_id uuid not null references public.camber_quotations(id),item_id text not null,
 proposal_version_id uuid not null references public.camber_quote_versions(id),selected_by uuid not null references auth.users(id),
 selected_at timestamptz not null default now(),primary key(quotation_id,item_id)
);
alter table public.camber_quote_versions enable row level security;
alter table public.camber_quote_events enable row level security;
alter table public.camber_quote_item_selections enable row level security;
revoke all on public.camber_quote_versions,public.camber_quote_events,public.camber_quote_item_selections from anon,authenticated;
grant all on public.camber_quote_versions,public.camber_quote_events,public.camber_quote_item_selections to service_role;
grant usage,select on sequence public.camber_quote_events_id_seq to service_role;

create or replace function public.camber_quotes_v2(action text,payload jsonb,actor uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
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
end $$;
revoke all on function public.camber_quotes_v2(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.camber_quotes_v2(text,jsonb,uuid) to service_role;
create or replace function public.camber_quote_sync_status() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare k jsonb;o jsonb;p jsonb;oi int;pi int;label text;
begin
 select value into k from public.kv_store where workspace='mabe' and key='mabe-opps-v3-'||new.project_id for update;
 select x,(ord-1)::int into o,oi from jsonb_array_elements(k) with ordinality a(x,ord) where x->>'id'=new.opportunity_id;
 select x,(ord-1)::int into p,pi from jsonb_array_elements(o->'proposals') with ordinality a(x,ord) where x->>'id'=new.proposal_id and x->>'supplierId'=new.supplier_id;
 if p is null then return new;end if;
 if coalesce(o->>'selectedProposalId','')<>'' and exists(select 1 from public.camber_quotations q where q.project_id=new.project_id and q.opportunity_id=new.opportunity_id and q.selected_request_id is not null and q.id is distinct from new.quotation_id) then return new;end if;
 label=case new.status when 'INVITED' then 'Convidado' when 'VIEWED' then 'Visualizou' when 'IN_PROGRESS' then 'Preenchendo' when 'SUBMITTED' then 'Proposta recebida' when 'DECLINED' then 'Não participará' when 'DISQUALIFIED' then 'Desclassificado' when 'EXPIRED' then 'Prazo encerrado' when 'SELECTED' then 'Selecionado' when 'NOT_SELECTED' then 'Não selecionado' else 'Rascunho' end;
 p=p||jsonb_build_object('quoteStatus',new.status,'status',label,'quoteRequestId',new.id,'invitedAt',new.created_at,'quoteExpiresAt',new.expires_at);
 o=jsonb_set(o,array['proposals',pi::text],p)||jsonb_build_object('supplierMutation',gen_random_uuid());
 update public.kv_store set value=jsonb_set(k,array[oi::text],o),updated_at=clock_timestamp() where workspace='mabe' and key='mabe-opps-v3-'||new.project_id;
 return new;
end $$;
revoke all on function public.camber_quote_sync_status() from public,anon,authenticated;
drop trigger if exists camber_quote_sync_status on public.camber_quote_requests;
create trigger camber_quote_sync_status after insert or update of status,active,expires_at on public.camber_quote_requests for each row execute function public.camber_quote_sync_status();
