-- Run with a disposable PostgreSQL database or within a rolled-back transaction.
do $$
declare a uuid; qid uuid=gen_random_uuid();rid uuid=gen_random_uuid();vid uuid=gen_random_uuid();
 pid uuid=gen_random_uuid(); input jsonb; failed boolean; original jsonb='{"total":5000,"payment":"50/50","delivery":"2026-10-01"}'; data jsonb;
begin
 select id into strict a from public.profiles where ativo and aprovado and papel='admin' limit 1;
 insert into public.camber_quotations(id,project_id,opportunity_id,specification,expires_at,created_by) values(qid,'pc-test-'||qid,'1','{}',now()+interval '5 days',a);
 insert into public.camber_quote_requests(id,project_id,opportunity_id,proposal_id,supplier_id,supplier_name,project_name,service,specification,created_by,expires_at,quotation_id,response)
 values(rid,'pc-test-'||qid,'1','1','1','Fornecedor fictício','Projeto fictício','Marcenaria','{}',a,now()+interval '5 days',qid,original);
 insert into public.camber_quote_versions(id,request_id,version,response) values(vid,rid,1,original);
 insert into public.camber_purchase_orders(id,quotation_id,proposal_version_id,created_by,expected_delivery) values(pid,qid,vid,a,'2026-10-01');
 input=jsonb_build_object('id',pid,'operation','edit','expectedVersion',0,'mutationId',gen_random_uuid(),
  'total',4500.75,'paymentTerms',jsonb_build_object('type','card','installments',4),'expectedDelivery','2026-11-20','notes','Entrega pela manhã',
  'content','{"items":[{"title":"Armário","quantity":1,"unit":"un","unitPrice":4700,"value":4700}],"total":4700}'::jsonb,
  'confirmedDelivery','2026-11-21','orderState','APPROVED','paymentState','PARTIAL','deliveryState','SCHEDULED','installationState','PENDING');
 begin perform public.camber_purchase_change(input,null);raise exception 'Acesso público aceito';exception when insufficient_privilege then null;end;
 perform public.camber_purchase_change(input,a);
 if not exists(select 1 from public.camber_purchase_orders where id=pid and approved_by=a and approved_at is not null and state='APPROVED') then raise exception 'Aprovação do pedido não registrada';end if;
 perform public.camber_purchase_change(input,a);
 if not exists(select 1 from public.camber_purchase_orders where id=pid and edit_version=1 and order_total=4500.75 and order_payment_terms->>'type'='card' and expected_delivery='2026-11-20' and order_notes='Entrega pela manhã' and payment_state='PARTIAL' and confirmed_delivery='2026-11-21' and order_content#>>'{items,0,title}'='Armário') then raise exception 'Edição ou repetição falhou';end if;
 failed=false;begin perform public.camber_purchase_change(input||jsonb_build_object('mutationId',gen_random_uuid()),a);exception when raise_exception then failed=true;end;
 if not failed then raise exception 'Sobrescreveu edição concorrente';end if;
 failed=false;begin perform public.camber_purchase_change(input||jsonb_build_object('expectedVersion',1,'mutationId',gen_random_uuid(),'total',-1),a);exception when raise_exception then failed=true;end;
 if not failed then raise exception 'Valor inválido aceito';end if;
 input=jsonb_build_object('id',pid,'operation','trash','expectedVersion',1,'mutationId',gen_random_uuid());
 perform public.camber_purchase_change(input,a);
 perform public.camber_purchase_change(input,a);
 if not exists(select 1 from public.camber_purchase_orders where id=pid and deleted_at is not null and edit_version=2) then raise exception 'Exclusão não confirmada';end if;
 failed=false;begin perform public.camber_purchase_change(input||jsonb_build_object('operation','edit','expectedVersion',2,'mutationId',gen_random_uuid()),a);exception when raise_exception then failed=true;end;
 if not failed then raise exception 'Permitiu edição na lixeira';end if;
 data=public.camber_quotes_api('purchase',jsonb_build_object('quotationId',qid),a);
 if data->>'id' is distinct from pid::text then raise exception 'Gerou outro pedido';end if;
 perform public.camber_purchase_change(input||jsonb_build_object('operation','restore','expectedVersion',2,'mutationId',gen_random_uuid()),a);
 if not exists(select 1 from public.camber_purchase_orders where id=pid and deleted_at is null and edit_version=3 and proposal_version_id=vid and order_total=4500.75) then raise exception 'Restauração falhou';end if;
 if not exists(select 1 from public.camber_quote_versions where id=vid and response=original) then raise exception 'Proposta original alterada';end if;
 if (select count(*) from public.camber_quote_events where quotation_id=qid)<>3 then raise exception 'Histórico duplicado';end if;
 select to_jsonb(p)-array['state','approved_by','approved_at','edit_version','last_mutation'] into data from public.camber_purchase_orders p where id=pid;
 input=jsonb_build_object('id',pid,'operation','reject','expectedVersion',3,'mutationId',gen_random_uuid());
 begin perform public.camber_purchase_change(input,null);raise exception 'Reprovação pública aceita';exception when insufficient_privilege then null;end;
 perform public.camber_purchase_change(input,a);
 perform public.camber_purchase_change(input,a);
 if not exists(select 1 from public.camber_purchase_orders p where id=pid and state='REJECTED' and approved_at is null and approved_by is null and edit_version=4 and to_jsonb(p)-array['state','approved_by','approved_at','edit_version','last_mutation']=data) then raise exception 'Reprovação alterou outros dados';end if;
 if (select count(*) from public.camber_quote_events where quotation_id=qid and actor=a and created_at is not null and event like '% reprovado')<>1 then raise exception 'Auditoria de reprovação inválida';end if;
 failed=false;begin perform public.camber_purchase_change(input||jsonb_build_object('operation','approve','mutationId',gen_random_uuid()),a);exception when raise_exception then failed=true;end;
 if not failed then raise exception 'Aprovação desatualizada sobrescreveu a reprovação';end if;
 input=input||jsonb_build_object('operation','approve','expectedVersion',4,'mutationId',gen_random_uuid());
 perform public.camber_purchase_change(input,a);
 perform public.camber_purchase_change(input||jsonb_build_object('expectedVersion',5,'mutationId',gen_random_uuid()),a);
 if not exists(select 1 from public.camber_purchase_orders p where id=pid and state='APPROVED' and approved_by=a and approved_at is not null and edit_version=5 and to_jsonb(p)-array['state','approved_by','approved_at','edit_version','last_mutation']=data) then raise exception 'Aprovação alterou outros dados';end if;
 if (select count(*) from public.camber_quote_events where quotation_id=qid and actor=a and created_at is not null and event like '% aprovado')<>1 then raise exception 'Auditoria de aprovação inválida';end if;
 perform public.camber_purchase_change(input||jsonb_build_object('operation','trash','expectedVersion',5,'mutationId',gen_random_uuid()),a);
 failed=false;begin perform public.camber_purchase_change(input||jsonb_build_object('operation','reject','expectedVersion',6,'mutationId',gen_random_uuid()),a);exception when raise_exception then failed=true;end;
 if not failed then raise exception 'Reprovou pedido na lixeira';end if;
 if has_function_privilege('anon','public.camber_purchase_change(jsonb,uuid)','execute') or has_function_privilege('authenticated','public.camber_purchase_change(jsonb,uuid)','execute') then raise exception 'Acesso direto exposto';end if;
end $$;
