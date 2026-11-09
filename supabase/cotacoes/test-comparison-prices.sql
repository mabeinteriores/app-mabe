-- Same opportunity and proposal are reused in two quotations with different supplier totals.
do $$
declare actor_id uuid; pid text='prices-'||gen_random_uuid(); quotation uuid; request uuid; data jsonb; recorded jsonb;
 supplier_cost numeric;
begin
 select id into strict actor_id from public.profiles where ativo and aprovado and papel='admin' limit 1;
 insert into public.kv_store(workspace,key,value) values('mabe','mabe-opps-v3-'||pid,
 '[{"id":"o","serv":"Reforma Geral","proposals":[{"id":"rb","value":99000,"remuneration":{"mode":"markup","markup":15000,"markupType":"brl"}},{"id":"lacerda","rt":10,"rtTipo":"pct"}]}]');
 foreach supplier_cost in array array[64000,99000] loop
  quotation=gen_random_uuid();request=gen_random_uuid();
  insert into public.camber_quotations(id,project_id,opportunity_id,specification,expires_at,created_by) values(quotation,pid,'o','{}',now()+interval '1 day',actor_id);
  insert into public.camber_quote_requests(id,project_id,opportunity_id,proposal_id,supplier_id,supplier_name,project_name,service,specification,created_by,expires_at,quotation_id,response)
  values(request,pid,'o','rb','1','RB','Teste','Reforma Geral','{}',actor_id,now()+interval '1 day',quotation,jsonb_build_object('total',supplier_cost)),
        (gen_random_uuid(),pid,'o','lacerda','2','Lacerda','Teste','Reforma Geral','{}',actor_id,now()+interval '1 day',quotation,'{"total":112000}');
  data=public.camber_quotes_api('detail',jsonb_build_object('quotationId',quotation),actor_id);
  select x into strict recorded from jsonb_array_elements(data->'clientPrices') x where x->>'requestId'=request::text;
  if (recorded->>'value')::numeric is distinct from supplier_cost+15000 then raise exception 'Usou preço de outra solicitação';end if;
  if (select (x->>'value')::numeric from jsonb_array_elements(data->'clientPrices') x where x->>'proposalId'='lacerda') is distinct from 112000 then raise exception 'RT já incluída somada novamente';end if;
 end loop;
end $$;
