-- Exclusive to the authenticated Edge Function; no direct browser RPC access.
create or replace function public.camber_opportunity_delete(action text,payload jsonb,actor uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 pid text=payload->>'projectId'; oid text=payload->>'opportunityId';
 items jsonb; opportunity jsonb; projects jsonb; project jsonb; project_index int;
 quotes jsonb; requests jsonb; version text; blocked boolean;
 remaining jsonb; won_value numeric; pipeline_value numeric; commission numeric;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and ativo and aprovado and (papel='admin' or 'projetos'=any(abas_permitidas))) then
  raise exception 'Acesso não autorizado.' using errcode='42501';
 end if;
 if action not in ('preview','delete') or coalesce(pid,'')='' or coalesce(oid,'')='' or length(pid)>100 or length(oid)>100 then raise exception 'Informe o projeto e a oportunidade.';end if;
 perform pg_advisory_xact_lock(hashtextextended('camber-quotes-'||pid,0));
 select value into items from public.kv_store where workspace='mabe' and key='mabe-opps-v3-'||pid for update;
 select x into opportunity from jsonb_array_elements(coalesce(items,'[]')) x where x->>'id'=oid;
 if opportunity is null then
  if action='delete' and coalesce(payload->>'version','')<>'' then return '{"deleted":true,"alreadyDeleted":true}';end if;
  raise exception 'Oportunidade não encontrada. Atualize a lista.';
 end if;
 select value into projects from public.kv_store where workspace='mabe' and key='mabe-projects-v3' for update;
 select x,(ord-1)::int into project,project_index from jsonb_array_elements(projects) with ordinality t(x,ord) where x->>'id'=pid;
 if project is null then raise exception 'Projeto não encontrado.';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]') into quotes from public.camber_quotations q where project_id=pid and opportunity_id=oid;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'active',r.active,'status',r.status,'revision',r.revision,'draftRevision',r.draft_revision,'response',r.response) order by r.id),'[]') into requests from public.camber_quote_requests r where project_id=pid and opportunity_id=oid;
 version=md5(jsonb_build_object('opportunity',opportunity,'quotations',quotes,'requests',requests)::text);
 blocked=coalesce(opportunity->>'selectedProposalId','')<>''
  or exists(select 1 from public.camber_quotations q where project_id=pid and opportunity_id=oid and selected_request_id is not null)
  or exists(select 1 from public.camber_purchase_orders p join public.camber_quotations q on q.id=p.quotation_id where q.project_id=pid and q.opportunity_id=oid);
 if action='preview' then
  return jsonb_build_object('service',opportunity->>'serv','projectName',project->>'nome','quotations',jsonb_array_length(quotes),'requests',jsonb_array_length(requests),'blocked',blocked,'version',version);
 end if;
 if blocked then raise exception 'Esta oportunidade tem fornecedor escolhido ou pedido de compra e não pode ser excluída.';end if;
 if coalesce(payload->>'version','')<>version then raise exception 'A oportunidade ou suas cotações mudaram. Feche esta janela e confira novamente antes de excluir.';end if;
 -- Keep supplier responses, files and events for historical consultation.
 update public.camber_quotations set state='CLOSED',workflow='CANCELED' where project_id=pid and opportunity_id=oid;
 update public.camber_quote_requests set active=false where project_id=pid and opportunity_id=oid;
 insert into public.camber_quote_events(quotation_id,event,actor)
  select id,'Oportunidade excluída: '||(opportunity->>'serv')||'. Cotação cancelada e links encerrados.',actor from public.camber_quotations where project_id=pid and opportunity_id=oid;
 insert into public.camber_quote_events(request_id,event,actor)
  select id,'Oportunidade excluída: '||(opportunity->>'serv')||'. Link encerrado.',actor from public.camber_quote_requests where project_id=pid and opportunity_id=oid and quotation_id is null;
 select coalesce(jsonb_agg(x order by ord),'[]') into remaining from jsonb_array_elements(items) with ordinality t(x,ord) where x->>'id' is distinct from oid;
 -- The existing kv_store history trigger retains the previous opportunity snapshot.
 update public.kv_store set value=remaining,updated_at=clock_timestamp(),updated_by=actor where workspace='mabe' and key='mabe-opps-v3-'||pid;
 select coalesce(sum(coalesce((x->>'val')::numeric,0)) filter(where x->>'et'='win'),0),
  coalesce(sum(coalesce((x->>'val')::numeric,0)) filter(where x->>'et' is distinct from 'lost'),0),
  coalesce(sum(case when x->>'rtTipo'='brl' then coalesce((x->>'rt')::numeric,0) else coalesce((x->>'val')::numeric,0)*coalesce((x->>'rt')::numeric,0)/100 end) filter(where x->>'et'='win'),0)
 into won_value,pipeline_value,commission from jsonb_array_elements(remaining) x;
 project=project||jsonb_build_object('op',jsonb_array_length(remaining),'pct',case when pipeline_value=0 then 0 else round(won_value/pipeline_value*100) end,'rt',round(commission));
 update public.kv_store set value=jsonb_set(projects,array[project_index::text],project),updated_at=clock_timestamp(),updated_by=actor where workspace='mabe' and key='mabe-projects-v3';
 return jsonb_build_object('deleted',true,'quotationsCanceled',jsonb_array_length(quotes));
end $$;
revoke all on function public.camber_opportunity_delete(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.camber_opportunity_delete(text,jsonb,uuid) to service_role;
