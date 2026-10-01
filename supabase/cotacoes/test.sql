begin;
do $$
declare a uuid;r jsonb;t text;v jsonb;res jsonb;response jsonb; spec jsonb;
begin
 select id into a from public.profiles where papel='admin' and ativo and aprovado limit 1;
 if a is null then raise exception 'No active administrator';end if;
 update public.kv_store set value=value||'[{"id":"quote-qa-project","nome":"Obra QA temporária"}]'::jsonb where workspace='mabe' and key='mabe-projects-v3';
 update public.kv_store set value=value||'[{"id":"quote-qa-supplier","nome":"Fornecedor QA temporário","categorias":["Marcenaria"],"ativo":true}]'::jsonb where workspace='mabe' and key='mabe-fornecedores-v1';
 insert into public.kv_store(workspace,key,value) values('mabe','mabe-opps-v3-quote-qa-project','[{"id":"opp-qa","serv":"Marcenaria","et":"prospec","favoriteProposalId":"p-qa","proposals":[{"id":"p-qa","supplierId":"quote-qa-supplier","name":"Fornecedor QA temporário","value":0,"rt":10,"rtTipo":"pct"}]}]');
 spec='{"mode":"custom","title":"Marcenaria QA","description":"Pedido temporário","items":[{"id":"1","room":"Cozinha","title":"Armário","quantity":2,"unit":"unidade"}]}';
 r=public.camber_quotes_api('create',jsonb_build_object('id','e130e0bb-b590-4864-a044-43cd7571cf14','projectId','quote-qa-project','opportunityId','opp-qa','proposalId','p-qa','specification',spec,'expiresAt',now()+interval '1 day'),a);t=r->>'token';
 res=public.camber_quotes_api('lookup',jsonb_build_object('token',t));
 if res ? 'token' or res ? 'created_by' or res ? 'proposal_id' then raise exception 'Private fields leaked';end if;
 response='{"version":1,"items":[{"id":"1","room":"Cozinha","title":"Armário","quantity":2,"unit":"unidade","value":3000}],"total":3400,"subtotal":3000,"freight":100,"assembly":400,"discount":100,"days":30,"payment":"50% entrada","scope":"Conforme projeto"}';
 res=public.camber_quotes_api('submit',jsonb_build_object('token',t,'response',response));
 if res->>'ok'<>'true' then raise exception 'Submission failed';end if;
 perform public.camber_quotes_api('submit',jsonb_build_object('token',t,'response',response||'{"total":9999}'));
 select value->0 into v from public.kv_store where key='mabe-opps-v3-quote-qa-project' and workspace='mabe';
 if v->>'val'<>'3400' or v#>>'{proposals,0,value}'<>'3400' or jsonb_array_length(v->'proposalHistory')<>1 then raise exception 'Projection/idempotency failed %',v;end if;
 begin perform public.camber_quotes_api('list','{"projectId":"quote-qa-project","opportunityId":"opp-qa"}',null);raise exception 'Unauthorized read succeeded';exception when insufficient_privilege then null;end;
 perform public.camber_quotes_api('revoke',jsonb_build_object('id',r->>'id'),a);
 begin perform public.camber_quotes_api('lookup',jsonb_build_object('token',t));raise exception 'Revoked token accepted';exception when raise_exception then if SQLERRM='Revoked token accepted' then raise;end if;end;
 if has_function_privilege('anon','public.camber_quotes_api(text,jsonb,uuid)','execute') then raise exception 'Anon can bypass API';end if;
end $$;
rollback;
select 'quote transaction checks passed; fixtures rolled back' as result;
