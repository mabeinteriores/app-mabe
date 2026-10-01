begin;
do $$
declare actor uuid;pid text='flow-qa-'||gen_random_uuid();qid uuid=gen_random_uuid();spec jsonb;payload jsonb;result jsonb;q jsonb;r1 public.camber_quote_requests%rowtype;r2 public.camber_quote_requests%rowtype;response jsonb;
begin
 select id into actor from public.profiles where papel='admin' and ativo and aprovado limit 1;
 if actor is null then raise exception 'Administrator required';end if;
 update public.kv_store set value=value||jsonb_build_array(jsonb_build_object('id',pid,'nome','Obra QA fluxo','cliente','Cliente QA fluxo','clienteId',pid)) where workspace='mabe' and key='mabe-projects-v3';
 update public.kv_store set value=value||jsonb_build_array(
  jsonb_build_object('id',pid||'-a','nome','QA Alfa','categorias',jsonb_build_array('Marcenaria'),'ativo',true),
  jsonb_build_object('id',pid||'-b','nome','QA Beta','categorias',jsonb_build_array('Marcenaria'),'ativo',true),
  jsonb_build_object('id',pid||'-c','nome','QA Gama','categorias',jsonb_build_array('Marcenaria'),'ativo',true)) where workspace='mabe' and key='mabe-fornecedores-v1';
 spec='{"mode":"custom","title":"Marcenaria QA","description":"Pedido QA","items":[{"id":"item1","room":"Cozinha","title":"Armário","quantity":1,"unit":"un"}]}';
 payload=jsonb_build_object('quotationId',qid,'projectId',pid,'opportunityId','100001','service','Marcenaria','responsible','QA','estimatedValue',20000,'specification',spec,'expiresAt',now()+interval '14 days','supplierIds',jsonb_build_array(pid||'-a',pid||'-b',pid||'-c'));
 result=public.camber_quotes_api('create_opportunity',payload,actor);
 perform public.camber_quotes_api('create_opportunity',payload,actor);
 if (select count(*) from public.camber_quotations where project_id=pid)<>1 or (select count(*) from public.camber_quote_requests where quotation_id=qid)<>3 then raise exception 'Duplicate or incomplete creation';end if;
 if (select value#>>'{0,et}' from public.kv_store where workspace='mabe' and key='mabe-opps-v3-'||pid)<>'prospec' then raise exception 'Wrong Kanban stage';end if;
 select x into q from jsonb_array_elements(public.camber_quotes_api('dashboard','{}',actor)) x where x->>'id'=qid::text;
 if q->>'client_name'<>'Cliente QA fluxo' or q->>'project_id'<>pid or q->>'invited'<>'3' or q->>'received'<>'0' or q->>'awaiting'<>'3' then raise exception 'Wrong initial context or counts';end if;
 select * into r1 from public.camber_quote_requests where quotation_id=qid and supplier_id=pid||'-a';
 select * into r2 from public.camber_quote_requests where quotation_id=qid and supplier_id=pid||'-b';
 response='{"version":1,"items":[{"id":"item1","room":"Cozinha","title":"Armário","quantity":1,"unit":"un","unitPrice":1200,"value":1200}],"total":1200,"subtotal":1200,"days":30,"payment":"50/50"}';
 perform public.camber_quotes_api('submit',jsonb_build_object('token',r1.token,'response',response));
 perform public.camber_quotes_api('submit',jsonb_build_object('token',r2.token,'response',response));
 select x into q from jsonb_array_elements(public.camber_quotes_api('dashboard','{}',actor)) x where x->>'id'=qid::text;
 if q->>'received'<>'2' or q->>'awaiting'<>'1' or (select count(*) from jsonb_array_elements(q->'suppliers') s where (s->>'responded')::bool)<>2 then raise exception 'Response count or participant state mismatch';end if;
 if q::text like '%token%' or q::text like '%draft%' then raise exception 'Private request fields exposed';end if;
 perform public.camber_quotes_api('disqualify',jsonb_build_object('id',r2.id),actor);
 select x into q from jsonb_array_elements(public.camber_quotes_api('dashboard','{}',actor)) x where x->>'id'=qid::text;
 if q->>'invited'<>'2' or q->>'received'<>'1' or q->>'awaiting'<>'1' or jsonb_array_length(q->'suppliers')<>2 then raise exception 'Removed participant counted';end if;
 if (select count(*) from public.camber_quote_requests where quotation_id=qid)<>3 then raise exception 'History deleted';end if;
 if has_function_privilege('anon','public.camber_quotation_summary()','execute') or has_function_privilege('authenticated','public.camber_quotation_summary()','execute') then raise exception 'Public access exposed';end if;
end $$;
rollback;
select 'PASS: projeto/cliente corretos, Prospecção, uma cotação, três participantes, repetição, respostas, remoção, histórico e permissões. Dados de teste revertidos.' result;
