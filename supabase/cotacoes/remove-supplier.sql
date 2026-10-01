-- Called by the authenticated Edge action remove_supplier only.
create or replace function public.camber_remove_supplier(payload jsonb,actor uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 pid text=payload->>'projectId';oid text=payload->>'opportunityId';v_proposal_id text=payload->>'proposalId';
 k jsonb;o jsonb;p jsonb;remaining jsonb;ref jsonb;projects jsonb;pr jsonb;
 oi int;pri int;r public.camber_quote_requests%rowtype;actor_name text;
 won numeric;pipe numeric;gain numeric;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and ativo and aprovado and (papel='admin' or 'projetos'=any(abas_permitidas))) then
  raise exception 'Acesso não autorizado.' using errcode='42501';
 end if;
 if coalesce(pid,'')='' or coalesce(oid,'')='' or coalesce(v_proposal_id,'')='' then raise exception 'Informe projeto, oportunidade e fornecedor.';end if;
 perform pg_advisory_xact_lock(hashtextextended('camber-quotes-'||pid,0));
 select value into k from public.kv_store where workspace='mabe' and key='mabe-opps-v3-'||pid for update;
 select x,(ord-1)::int into o,oi from jsonb_array_elements(case when jsonb_typeof(k)='array' then k else '[]'::jsonb end) with ordinality a(x,ord) where x->>'id'=oid;
 if o is null then raise exception 'Oportunidade não encontrada.';end if;
 -- Normalize the historical single-supplier representation as the UI does.
 if jsonb_typeof(o->'proposals') is distinct from 'array' then
  o=o||jsonb_build_object('proposals','[]'::jsonb);
  if coalesce(trim(o->>'forn'),'') not in ('','a definir') then
   p=jsonb_build_object('id','legacy-'||(o->>'id'),'supplierId',null,'name',o->>'forn','value',coalesce((o->>'val')::numeric,0),'rt',coalesce((o->>'rt')::numeric,0),'rtTipo',coalesce(o->>'rtTipo','pct'),'days',null,'payment',coalesce(o->>'payment',''),'scope',coalesce(o->>'obs',''),'status','Proposta recebida');
   o=o||jsonb_build_object('proposals',jsonb_build_array(p),'favoriteProposalId',p->>'id');
  end if;
 end if;
 select x into p from jsonb_array_elements(o->'proposals') x where x->>'id'=v_proposal_id;
 if p is null then
  if exists(select 1 from jsonb_array_elements(coalesce(o->'removedProposals','[]')) x where x->>'id'=v_proposal_id) then
   return jsonb_build_object('ok',true,'alreadyRemoved',true,'opportunityId',oid,'proposalId',v_proposal_id);
  end if;
  raise exception 'Fornecedor não encontrado nesta oportunidade.';
 end if;
 if coalesce(o->>'selectedProposalId','')<>'' or o->>'et'='win'
 or exists(select 1 from public.camber_quotations where project_id=pid and opportunity_id=oid and selected_request_id is not null)
 or exists(select 1 from public.camber_purchase_orders po join public.camber_quotations q on q.id=po.quotation_id where q.project_id=pid and q.opportunity_id=oid)
 or exists(select 1 from public.camber_quote_requests where project_id=pid and opportunity_id=oid and status='SELECTED') then
  raise exception 'Há fornecedor escolhido ou pedido de compra. Reabra a comparação antes de remover fornecedores.';
 end if;
 if not (payload ? 'expectedMutation') or (o->>'supplierMutation') is distinct from (payload->>'expectedMutation') then
  raise exception 'Esta oportunidade mudou. Atualize as propostas antes de remover o fornecedor.';
 end if;
 -- Keep requests, versions, documents and events; revoke every round for this supplier.
 for r in select * from public.camber_quote_requests where project_id=pid and opportunity_id=oid
 and (camber_quote_requests.proposal_id=v_proposal_id or supplier_id=p->>'supplierId' or id::text=p->>'quoteRequestId') for update loop
  update public.camber_quote_requests set active=false,status='DISQUALIFIED' where id=r.id;
  insert into public.camber_quote_events(request_id,quotation_id,event,actor) values(r.id,r.quotation_id,'Fornecedor removido da oportunidade: '||(p->>'name'),actor);
 end loop;
 select coalesce(jsonb_agg(x order by ord),'[]'::jsonb) into remaining from jsonb_array_elements(o->'proposals') with ordinality a(x,ord) where x->>'id'<>v_proposal_id;
 select x into ref from jsonb_array_elements(remaining) x where x->>'id'=o->>'favoriteProposalId';
 if ref is null then ref=remaining->0;end if;
 select nome into actor_name from public.profiles where id=actor;
 o=o||jsonb_build_object('proposals',remaining,'favoriteProposalId',ref->>'id',
  'forn',coalesce(ref->>'name','a definir'),'val',coalesce((ref->>'value')::numeric,0),'rt',coalesce((ref->>'rt')::numeric,0),'rtTipo',coalesce(ref->>'rtTipo','pct'),
  'removedProposals',coalesce(o->'removedProposals','[]')||jsonb_build_array(p||jsonb_build_object('removedAt',now(),'removedBy',actor)),
  'supplierMutation',gen_random_uuid(),'proposalHistory',coalesce(o->'proposalHistory','[]')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'at',now(),'user',coalesce(actor_name,'Usuário do sistema'),'text','Fornecedor removido da cotação: '||(p->>'name')||'. Cadastro e propostas anteriores preservados.')));
 k=jsonb_set(k,array[oi::text],o);
 update public.kv_store set value=k,updated_at=clock_timestamp(),updated_by=actor where workspace='mabe' and key='mabe-opps-v3-'||pid;
 -- Recalculate the project summary with the same rules as CamberDB.recalc.
 select value into projects from public.kv_store where workspace='mabe' and key='mabe-projects-v3' for update;
 select x,(ord-1)::int into pr,pri from jsonb_array_elements(case when jsonb_typeof(projects)='array' then projects else '[]'::jsonb end) with ordinality a(x,ord) where x->>'id'=pid;
 if pr is not null then
  select coalesce(sum(coalesce((x->>'val')::numeric,0)) filter(where x->>'et'='win'),0),
   coalesce(sum(coalesce((x->>'val')::numeric,0)) filter(where x->>'et' is distinct from 'lost'),0),
   coalesce(sum(case when x->>'rtTipo'='brl' then coalesce((x->>'rt')::numeric,0) else coalesce((x->>'val')::numeric,0)*coalesce((x->>'rt')::numeric,0)/100 end) filter(where x->>'et'='win'),0)
   into won,pipe,gain from jsonb_array_elements(k) x;
  pr=pr||jsonb_build_object('op',jsonb_array_length(k),'pct',case when pipe=0 then 0 else round(won/pipe*100) end,'rt',round(gain));
  update public.kv_store set value=jsonb_set(projects,array[pri::text],pr),updated_at=clock_timestamp(),updated_by=actor where workspace='mabe' and key='mabe-projects-v3';
 end if;
 return jsonb_build_object('ok',true,'alreadyRemoved',false,'opportunityId',oid,'proposalId',v_proposal_id);
end $$;
revoke all on function public.camber_remove_supplier(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.camber_remove_supplier(jsonb,uuid) to service_role;
