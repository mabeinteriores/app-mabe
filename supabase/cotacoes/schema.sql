create table if not exists public.camber_quote_requests (
 id uuid primary key, token uuid not null default gen_random_uuid() unique,
 project_id text not null, opportunity_id text not null, proposal_id text not null,
 supplier_id text not null, supplier_name text not null, project_name text not null,
 service text not null, specification jsonb not null,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 expires_at timestamptz not null, active boolean not null default true,
 response jsonb, responded_at timestamptz
);
create index if not exists camber_quote_opportunity on public.camber_quote_requests(project_id,opportunity_id,created_at desc);
alter table public.camber_quote_requests enable row level security;
revoke all on public.camber_quote_requests from anon,authenticated;
grant all on public.camber_quote_requests to service_role;
create table if not exists public.camber_quote_files (
 id uuid primary key, request_id uuid not null references public.camber_quote_requests(id),
 name text not null, path text not null unique, size bigint not null check(size>0 and size<=26214400),
 created_at timestamptz not null default now()
);
create index if not exists camber_quote_files_request on public.camber_quote_files(request_id);
alter table public.camber_quote_files enable row level security;
revoke all on public.camber_quote_files from anon,authenticated;
grant all on public.camber_quote_files to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('camber-cotacoes','camber-cotacoes',false,26214400) on conflict(id) do nothing;

create or replace function public.camber_quotes_core(action text,payload jsonb,actor uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.camber_quote_requests%rowtype; k jsonb; o jsonb; p jsonb; supplier jsonb; project jsonb; oi int; pi int; v_response jsonb; result jsonb; pid text; n int;
begin
 if action not in ('lookup','submit') then
  if actor is null or not exists(select 1 from public.profiles where id=actor and ativo and aprovado and (papel='admin' or 'projetos'=any(abas_permitidas))) then raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
 end if;
 if action in ('lookup','submit') then
  select * into r from public.camber_quote_requests where token=(payload->>'token')::uuid;
  if r.id is null or not r.active or r.expires_at<=now() then raise exception 'Link inválido, cancelado ou expirado.'; end if;
  pid=r.project_id;
 elsif action in ('revoke','file','file_read') then
  select * into r from public.camber_quote_requests where id=(payload->>'id')::uuid;
  if r.id is null then raise exception 'Pedido não encontrado.'; end if;
  pid=r.project_id;
 else pid=payload->>'projectId'; end if;
 if pid is null or length(pid)>80 then raise exception 'Projeto inválido.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('camber-quotes-'||pid,0));
 if r.id is not null then select * into r from public.camber_quote_requests where id=r.id for update; end if;
 if action in ('lookup','submit') and (not r.active or r.expires_at<=now()) then raise exception 'Link inválido, cancelado ou expirado.'; end if;
 if action='list' then
  return coalesce((select jsonb_agg(to_jsonb(q) order by created_at desc) from public.camber_quote_requests q where project_id=pid and opportunity_id=payload->>'opportunityId'),'[]'::jsonb);
 end if;
 if action='revoke' then update public.camber_quote_requests set active=false where id=r.id; return jsonb_build_object('ok',true); end if;
 if action in ('lookup','file_read') then
  return jsonb_build_object('id',r.id,'supplier_name',r.supplier_name,'project_name',r.project_name,'service',r.service,'specification',r.specification,'expires_at',r.expires_at,'response',r.response,'responded_at',r.responded_at,'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'size',f.size,'path',f.path)) from public.camber_quote_files f where request_id=r.id),'[]'::jsonb));
 end if;
 if action='file' then
  if not r.active or r.response is not null or r.expires_at<=now() then raise exception 'Este pedido não aceita novos anexos.'; end if;
  select count(*) into n from public.camber_quote_files where request_id=r.id;
  if n>=10 then raise exception 'Limite de 10 anexos por pedido.'; end if;
  insert into public.camber_quote_files(id,request_id,name,path,size) values((payload->>'fileId')::uuid,r.id,payload->>'name',r.id::text||'/'||(payload->>'fileId'),(payload->>'size')::bigint) on conflict(id) do nothing;
  return jsonb_build_object('ok',true);
 end if;
 select value into k from public.kv_store where workspace='mabe' and key='mabe-opps-v3-'||pid for update;
 select v,(ord-1)::int into o,oi from jsonb_array_elements(k) with ordinality x(v,ord) where v->>'id'=coalesce(r.opportunity_id,payload->>'opportunityId');
 if o is null then raise exception 'Oportunidade não encontrada.'; end if;
 if coalesce(o->>'selectedProposalId','')<>'' or o->>'et'='win' then raise exception 'Reabra a comparação antes de receber novas propostas.'; end if;
 select v,(ord-1)::int into p,pi from jsonb_array_elements(o->'proposals') with ordinality x(v,ord) where v->>'id'=coalesce(r.proposal_id,payload->>'proposalId');
 if p is null then raise exception 'Adicione o fornecedor à oportunidade primeiro.'; end if;
 if action='create' then
  select v into supplier from public.kv_store s cross join lateral jsonb_array_elements(case when jsonb_typeof(s.value)='array' then s.value else '[]'::jsonb end) x(v) where workspace='mabe' and key='mabe-fornecedores-v1' and v->>'id'=p->>'supplierId';
  if supplier is null or supplier->>'ativo'='false' or lower(supplier->>'status')='inativo' then raise exception 'Selecione um fornecedor ativo cadastrado.'; end if;
  if not exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(supplier->'categorias')='array' and jsonb_array_length(supplier->'categorias')>0 then supplier->'categorias' else jsonb_build_array(supplier->>'categoria') end) t(v) where translate(lower(trim(v)),'áàãâéêíóôõúç','aaaaeeiooouc')=translate(lower(trim(o->>'serv')),'áàãâéêíóôõúç','aaaaeeiooouc')) then raise exception 'Fornecedor sem o serviço desta oportunidade.'; end if;
  select * into r from public.camber_quote_requests where id=(payload->>'id')::uuid;
  if r.id is not null then
   if r.project_id<>pid or r.opportunity_id<>payload->>'opportunityId' or r.proposal_id<>payload->>'proposalId' then raise exception 'Identificador já utilizado.'; end if;
   return to_jsonb(r);
  end if;
  select v into project from public.kv_store s cross join lateral jsonb_array_elements(case when jsonb_typeof(s.value)='array' then s.value else '[]'::jsonb end) x(v) where workspace='mabe' and key='mabe-projects-v3' and v->>'id'=pid;
  if project is null then raise exception 'Projeto não encontrado.'; end if;
  -- Different quotations of one opportunity keep independent links and history.
  insert into public.camber_quote_requests(id,project_id,opportunity_id,proposal_id,supplier_id,supplier_name,project_name,service,specification,created_by,expires_at)
   values((payload->>'id')::uuid,pid,o->>'id',p->>'id',p->>'supplierId',supplier->>'nome',project->>'nome',o->>'serv',payload->'specification',actor,(payload->>'expiresAt')::timestamptz) returning * into r;
  return to_jsonb(r);
 elsif action='submit' then
  if r.response is not null and coalesce((r.response->>'version')::int,1)>=coalesce((payload->'response'->>'version')::int,1) then return jsonb_build_object('ok',true,'response',r.response,'responded_at',r.responded_at); end if;
  if p->>'supplierId'<>r.supplier_id then raise exception 'O fornecedor desta oportunidade foi alterado. Solicite um novo link.'; end if;
  v_response=payload->'response';
  if jsonb_typeof(v_response->'items')<>'array' or (v_response->>'total')::numeric<=0 then raise exception 'Proposta inválida.'; end if;
  update public.camber_quote_requests set response=v_response,responded_at=now() where id=r.id;
  p=p||jsonb_build_object('value',(v_response->>'total')::numeric,'days',(v_response->>'days')::int,'payment',v_response->>'payment','scope',v_response->>'scope','status','Proposta recebida','quoteRequestId',r.id,'quoteResponse',v_response,'quoteReceivedAt',now());
  o=jsonb_set(o,array['proposals',pi::text],p);
  if coalesce(o->>'favoriteProposalId','')='' then o=o||jsonb_build_object('favoriteProposalId',p->>'id'); end if;
  if o->>'favoriteProposalId'=p->>'id' then o=o||jsonb_build_object('val',p->'value','forn',p->'name','rt',p->'rt','rtTipo',p->'rtTipo'); end if;
  o=o||jsonb_build_object('supplierMutation',gen_random_uuid()::text,'proposalHistory',coalesce(o->'proposalHistory','[]')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'at',now(),'user',r.supplier_name,'text','Proposta recebida pelo link individual. Pedido '||r.id::text)));
  update public.kv_store set value=jsonb_set(k,array[oi::text],o),updated_at=clock_timestamp() where workspace='mabe' and key='mabe-opps-v3-'||pid;
  return jsonb_build_object('ok',true,'response',v_response,'responded_at',now());
 end if;
 raise exception 'Operação inválida.';
end $$;
revoke all on function public.camber_quotes_core(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.camber_quotes_core(text,jsonb,uuid) to service_role;
