begin;
set local role service_role;
do $$
declare a uuid;pid text='payment-qa-'||gen_random_uuid();sid text='payment-supplier-'||gen_random_uuid();r jsonb;t text;result jsonb;response jsonb;draft jsonb;
begin
 select id into a from public.profiles where papel='admin' and ativo and aprovado limit 1;
 if a is null then raise exception 'Administrator required';end if;
 update public.kv_store set value=value||jsonb_build_array(jsonb_build_object('id',pid,'nome','Obra QA condições comerciais')) where workspace='mabe' and key='mabe-projects-v3';
 update public.kv_store set value=value||jsonb_build_array(jsonb_build_object('id',sid,'nome','Fornecedor QA condições','ativo',true,'categorias',jsonb_build_array('Marcenaria'))) where workspace='mabe' and key='mabe-fornecedores-v1';
 insert into public.kv_store(workspace,key,value) values('mabe','mabe-opps-v3-'||pid,jsonb_build_array(jsonb_build_object('id','opp','serv','Marcenaria','et','prospec','favoriteProposalId','p','proposals',jsonb_build_array(jsonb_build_object('id','p','supplierId',sid,'name','Fornecedor QA condições','value',0,'rt',10,'rtTipo','pct')))));
 r=public.camber_quotes_api('create',jsonb_build_object('id',gen_random_uuid(),'projectId',pid,'opportunityId','opp','proposalId','p','specification','{"mode":"custom","title":"Armário QA","description":"Teste temporário","items":[{"id":"1","room":"Cozinha","title":"Armário","quantity":2,"unit":"un"}]}'::jsonb,'expiresAt',now()+interval '1 day'),a);t=r->>'token';
 result=public.camber_quotes_api('lookup',jsonb_build_object('token',t));
 draft='{"values":[1500],"validity":"2026-12-31","paymentTerms":{"type":"card","installments":6},"payment":"6x no cartão de crédito"}';
 perform public.camber_quotes_api('draft',jsonb_build_object('token',t,'revision',result->'revision','draft_revision',result->'draft_revision','draft',draft));
 result=public.camber_quotes_api('lookup',jsonb_build_object('token',t));
 if result#>'{draft,paymentTerms}' is distinct from draft->'paymentTerms' then raise exception 'Structured draft not preserved';end if;
 response='{"version":1,"items":[{"id":"1","room":"Cozinha","title":"Armário","quantity":2,"unit":"un","unitPrice":1500,"value":3000,"days":null}],"total":3000,"subtotal":3000,"freight":0,"assembly":0,"discount":0,"discountPercent":0,"days":null,"delivery":null,"start":null,"end":null,"validity":"2026-12-31","payment":"","paymentTerms":{"type":"unspecified"},"basis":"","scope":"","warranty":"","exclusions":""}';
 result=public.camber_quotes_api('submit',jsonb_build_object('token',t,'response',response));
 if result->>'ok'<>'true' then raise exception 'Minimal submission failed';end if;
 if (select qr.response from public.camber_quote_requests qr where qr.id=(r->>'id')::uuid) is distinct from response then raise exception 'Optional fields not preserved';end if;
 if (select value#>>'{0,proposals,0,value}' from public.kv_store where workspace='mabe' and key='mabe-opps-v3-'||pid)<>'3000' then raise exception 'Opportunity not updated';end if;
 perform public.camber_quotes_api('revise',jsonb_build_object('token',t));
 response=response||'{"version":2,"payment":"6x no cartão de crédito","paymentTerms":{"type":"card","installments":6}}';
 result=public.camber_quotes_api('submit',jsonb_build_object('token',t,'response',response));
 if result#>>'{response,payment}'<>'6x no cartão de crédito' or result#>>'{response,paymentTerms,installments}'<>'6' then raise exception 'Payment selection not preserved';end if;
 if (select value#>>'{0,proposals,0,payment}' from public.kv_store where workspace='mabe' and key='mabe-opps-v3-'||pid)<>'6x no cartão de crédito' then raise exception 'Payment not projected to opportunity';end if;
end $$;
rollback;
select 'PASS: structured draft, optional commercial fields, submission, revision and opportunity payment; all fixtures rolled back.' result;
