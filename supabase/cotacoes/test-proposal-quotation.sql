begin;
set local role service_role;
do $$
declare a uuid;pid text='proposal-qa-'||gen_random_uuid();sid text='supplier-qa-'||gen_random_uuid();q1 uuid=gen_random_uuid();data jsonb;body jsonb;op jsonb;failed boolean;before_projects jsonb;before_suppliers jsonb;cnt int;
begin
 select id into a from public.profiles where papel='admin' and ativo and aprovado limit 1;
 if a is null then raise exception 'Administrator required';end if;
 select value into before_projects from public.kv_store where workspace='mabe' and key='mabe-projects-v3';
 select value into before_suppliers from public.kv_store where workspace='mabe' and key='mabe-fornecedores-v1';
 update public.kv_store set value=value||jsonb_build_array(jsonb_build_object('id',pid,'nome','Obra QA conversão','cliente','Cliente QA conversão')) where workspace='mabe' and key='mabe-projects-v3';
 update public.kv_store set value=value||jsonb_build_array(jsonb_build_object('id',sid,'nome',sid,'ativo',true,'categorias',jsonb_build_array('Marcenaria')),jsonb_build_object('id',sid||'-b','nome',sid||'-b','ativo',true,'categorias',jsonb_build_array('Marcenaria'))) where workspace='mabe' and key='mabe-fornecedores-v1';
 op=jsonb_build_object('id',1,'serv','Marcenaria','et','prospec','prob',20,'val',4000,'forn',sid,'favoriteProposalId','p1','supplierMutation','initial','proposals',jsonb_build_array(jsonb_build_object('id','p1','supplierId',sid,'name',sid,'value',4000,'rt',10,'rtTipo','pct','scope','Armários da cozinha')));
 insert into public.kv_store(workspace,key,value) values('mabe','mabe-opps-v3-'||pid,jsonb_build_array(op,op||'{"id":2,"et":"negoc"}',op||'{"id":3,"et":"lost"}',(op-'proposals'-'favoriteProposalId')||'{"id":4}',op||'{"id":5,"proposals":[]}',op||'{"id":6,"serv":"Vidraçaria"}',op||'{"id":7,"selectedProposalId":"p1"}'));
 body=jsonb_build_object('projectId',pid,'opportunityId','1','proposalId','p1','expectedStage','prospec','expectedMutation','initial','quotationId',q1);
 begin perform public.camber_proposal_quotation(body);raise exception 'Unauthorized call accepted';exception when insufficient_privilege then null;end;
 data=public.camber_proposal_quotation(body,a);
 if data->>'quotationId'<>q1::text or (data->>'reused')::boolean then raise exception 'Creation failed';end if;
 if not exists(select 1 from public.camber_quotations where id=q1 and project_id=pid and opportunity_id='1' and workflow='AWAITING_SEND' and estimated_value=4000 and specification->>'description'='Armários da cozinha') then raise exception 'Incorrect quotation context';end if;
 if (select count(*) from public.camber_quote_requests where quotation_id=q1 and supplier_id=sid)<>1 then raise exception 'Wrong supplier or duplicate';end if;
 if (select value#>>'{0,et}' from public.kv_store where workspace='mabe' and key='mabe-opps-v3-'||pid)<>'prop' then raise exception 'Stage not changed';end if;
 if (select value#>>'{0,prob}' from public.kv_store where workspace='mabe' and key='mabe-opps-v3-'||pid)<>'20' then raise exception 'Probability modified';end if;
 select count(*) into cnt from public.camber_quote_events where quotation_id=q1;
 perform public.camber_proposal_quotation(body,a);
 perform public.camber_proposal_quotation(body||jsonb_build_object('quotationId',gen_random_uuid()),a);
 if (select count(*) from public.camber_quotations where project_id=pid and opportunity_id='1')<>1 or (select count(*) from public.camber_quote_events where quotation_id=q1)<>cnt then raise exception 'Retry duplicated quotation or event';end if;
 -- Returning the card and moving again must preserve its open quotation.
 update public.kv_store set value=jsonb_set(value,'{0,et}','"negoc"') where workspace='mabe' and key='mabe-opps-v3-'||pid;
 data=public.camber_proposal_quotation(body||jsonb_build_object('quotationId',gen_random_uuid(),'expectedStage','negoc','expectedMutation',(select value#>'{0,supplierMutation}' from public.kv_store where workspace='mabe' and key='mabe-opps-v3-'||pid)),a);
 if data->>'quotationId'<>q1::text or not (data->>'reused')::boolean then raise exception 'Existing quotation not reused';end if;
 -- The other permitted source stage and legacy suppliers work as well.
 update public.kv_store set value=jsonb_set(value,'{1,proposals}',(op->'proposals')||jsonb_build_array(jsonb_build_object('id','p2','supplierId',sid||'-b','name',sid||'-b','value',5000))) where workspace='mabe' and key='mabe-opps-v3-'||pid;
 data=public.camber_proposal_quotation(body||jsonb_build_object('opportunityId','2','proposalId','p2','expectedStage','negoc','quotationId',gen_random_uuid()),a);
 if (select count(*) from public.camber_quote_requests where quotation_id=(data->>'quotationId')::uuid)<>1 or not exists(select 1 from public.camber_quote_requests where quotation_id=(data->>'quotationId')::uuid and supplier_id=sid||'-b') then raise exception 'Alternative supplier not used exclusively';end if;
 perform public.camber_proposal_quotation(body||jsonb_build_object('opportunityId','4','proposalId','legacy-4','quotationId',gen_random_uuid()),a);
 if (select value#>>'{3,proposals,0,supplierId}' from public.kv_store where workspace='mabe' and key='mabe-opps-v3-'||pid)<>sid then raise exception 'Legacy supplier not linked';end if;
 -- Invalid/stale transitions cannot create quotations or move the card.
 for cnt in 3..7 loop
  if cnt=4 then continue;end if;
  failed=false;begin perform public.camber_proposal_quotation(body||jsonb_build_object('opportunityId',cnt::text,'quotationId',gen_random_uuid()),a);exception when raise_exception then failed=true;end;
  if not failed then raise exception 'Invalid case accepted: %',cnt;end if;
  if exists(select 1 from public.camber_quotations where project_id=pid and opportunity_id=cnt::text) then raise exception 'Invalid case created quotation';end if;
 end loop;
 update public.kv_store set value=jsonb_set(value,'{4,proposals}',op->'proposals') where workspace='mabe' and key='mabe-opps-v3-'||pid;
 failed=false;begin perform public.camber_proposal_quotation(body||jsonb_build_object('opportunityId','5','expectedMutation','stale','quotationId',gen_random_uuid()),a);exception when raise_exception then failed=true;end;
 if not failed then raise exception 'Stale supplier version accepted';end if;
 if (select value#>>'{4,et}' from public.kv_store where workspace='mabe' and key='mabe-opps-v3-'||pid)<>'prospec' then raise exception 'Failed action moved card';end if;
 if has_function_privilege('anon','public.camber_proposal_quotation(jsonb,uuid)','execute') or has_function_privilege('authenticated','public.camber_proposal_quotation(jsonb,uuid)','execute') then raise exception 'Direct browser access exposed';end if;
 if (select jsonb_agg(x order by ord) from public.kv_store,jsonb_array_elements(value) with ordinality t(x,ord) where workspace='mabe' and key='mabe-projects-v3' and x->>'id'<>pid) is distinct from before_projects then raise exception 'Unrelated projects changed';end if;
 if (select jsonb_agg(x order by ord) from public.kv_store,jsonb_array_elements(value) with ordinality t(x,ord) where workspace='mabe' and key='mabe-fornecedores-v1' and x->>'id' not in (sid,sid||'-b')) is distinct from before_suppliers then raise exception 'Unrelated suppliers changed';end if;
end $$;
rollback;
select 'PASS: duas origens, vínculo cliente/projeto/fornecedor, legado, repetição, reutilização, validações, permissões e rollback integral.' result;
