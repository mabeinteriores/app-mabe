-- All fixtures and modifications are rolled back. No commercial quotation is changed.
do $$
declare a uuid;qid uuid=gen_random_uuid();rid uuid=gen_random_uuid();tok uuid=gen_random_uuid();mid uuid=gen_random_uuid();b jsonb;d jsonb;failed boolean;act text;n int;
begin
 select id into a from public.profiles where ativo and aprovado and papel='admin' limit 1;
 if a is null then raise exception 'Admin fixture required';end if;
 insert into public.camber_quotations(id,project_id,opportunity_id,specification,expires_at,created_by)
 values(qid,'qa-control-'||qid,'qa','{}',now()+interval '5 days',a);
 insert into public.camber_quote_requests(id,token,project_id,opportunity_id,proposal_id,supplier_id,supplier_name,project_name,service,specification,created_by,expires_at,quotation_id,draft)
 values(rid,tok,'qa-control-'||qid,'qa','qa','qa','Fornecedor QA','Obra QA','Marcenaria','{}',a,now()+interval '5 days',qid,'{"values":[100]}');
 b=jsonb_build_object('quotationId',qid,'state','PAUSED','reason','Aguardando cliente','expectedVersion',0,'mutationId',mid);
 begin perform public.camber_quotes_api('workflow',b,null);raise exception 'Unauthorized accepted';exception when insufficient_privilege then null;end;
 perform public.camber_quotes_api('workflow',b,a);
 perform public.camber_quotes_api('workflow',b,a);
 if (select count(*) from public.camber_quote_events where quotation_id=qid)<>1 then raise exception 'Retry duplicated event';end if;
 if not exists(select 1 from public.camber_quotations where id=qid and state='CLOSED' and workflow='PAUSED' and control_version=1) then raise exception 'Pause failed';end if;
 d=public.camber_quotes_api('lookup',jsonb_build_object('token',tok));
 if d->>'control_state'<>'PAUSED' then raise exception 'Portal pause not visible';end if;
 foreach act in array array['draft','submit','revise','decline','supplier_file'] loop
  failed=false;begin perform public.camber_quotes_api(act,jsonb_build_object('token',tok));exception when raise_exception then failed=true;end;
  if not failed then raise exception 'Paused supplier operation allowed: %',act;end if;
 end loop;
 failed=false;begin perform public.camber_quotes_api('workflow',b||jsonb_build_object('mutationId',gen_random_uuid()),a);exception when raise_exception then failed=true;end;
 if not failed then raise exception 'Stale version accepted';end if;
 failed=false;begin perform public.camber_quotes_api('workflow',jsonb_build_object('quotationId',qid,'state','IN_QUOTATION'),a);exception when raise_exception then failed=true;end;
 if not failed then raise exception 'Legacy reopen bypass';end if;
 perform public.camber_quotes_api('workflow',jsonb_build_object('quotationId',qid,'state','RESUME','expectedVersion',1,'expiresAt',now()+interval '10 days'),a);
 if not exists(select 1 from public.camber_quote_requests where id=rid and token=tok and draft='{"values":[100]}' and expires_at>now()+interval '9 days') then raise exception 'Resume damaged draft/token/deadline';end if;
 perform public.camber_quotes_api('draft',jsonb_build_object('token',tok,'revision',1,'draft_revision',0,'draft','{"values":[200]}'::jsonb));
 perform public.camber_quotes_api('workflow',jsonb_build_object('quotationId',qid,'state','CANCELED','expectedVersion',2,'reason','Escopo alterado'),a);
 if (public.camber_quotes_api('lookup',jsonb_build_object('token',tok))->>'control_state')<>'CANCELED' then raise exception 'Cancel portal failed';end if;
 perform public.camber_quotes_api('workflow',jsonb_build_object('quotationId',qid,'state','ARCHIVED','expectedVersion',3),a);
 perform public.camber_quotes_api('workflow',jsonb_build_object('quotationId',qid,'state','RESTORE','expectedVersion',4),a);
 if not exists(select 1 from public.camber_quotations where id=qid and workflow='CANCELED' and state='CLOSED') then raise exception 'Restore reopened canceled quote';end if;
 perform public.camber_quotes_api('workflow',jsonb_build_object('quotationId',qid,'state','RESUME','expectedVersion',5,'expiresAt',now()+interval '10 days'),a);
 perform public.camber_quotes_api('workflow',jsonb_build_object('quotationId',qid,'state','DRAFT'),a);
 select control_version into n from public.camber_quotations where id=qid;
 perform public.camber_quotes_api('workflow',jsonb_build_object('quotationId',qid,'state','TRASH','expectedVersion',n),a);
 if (public.camber_quotes_api('lookup',jsonb_build_object('token',tok))->>'control_state')<>'TRASH' then raise exception 'Trash portal failed';end if;
 perform public.camber_quotes_api('workflow',jsonb_build_object('quotationId',qid,'state','RESTORE','expectedVersion',n+1),a);
 if not exists(select 1 from public.camber_quotations where id=qid and workflow='DRAFT' and state='CLOSED') then raise exception 'Restore draft failed';end if;
 update public.camber_quote_requests set response='{"total":100,"version":1}',responded_at=now() where id=rid;
 update public.camber_quotations set workflow='IN_QUOTATION',state='OPEN' where id=qid;
 b=jsonb_build_object('quotationId',qid,'state','TRASH','expectedVersion',n+2,'mutationId',gen_random_uuid());
 perform public.camber_quotes_api('workflow',b,a);
 perform public.camber_quotes_api('workflow',b,a);
 if not exists(select 1 from public.camber_quotations where id=qid and workflow='TRASH' and control_version=n+3) then raise exception 'Delete with response failed';end if;
 if (public.camber_quotes_api('lookup',jsonb_build_object('token',tok))->>'control_state') is distinct from 'TRASH' then raise exception 'Supplier link still active';end if;
 perform public.camber_quotes_api('workflow',jsonb_build_object('quotationId',qid,'state','RESTORE','expectedVersion',n+3),a);
 if not exists(select 1 from public.camber_quotations where id=qid and state='OPEN' and workflow='IN_QUOTATION') then raise exception 'Open quote not restored';end if;
 select control_version-2 into n from public.camber_quotations where id=qid;
 update public.camber_quotations set selected_request_id=rid,state='CLOSED',workflow='CLOSED' where id=qid;
 failed=false;begin perform public.camber_quotes_api('workflow',jsonb_build_object('quotationId',qid,'state','CANCELED','expectedVersion',n+2,'reason','Teste'),a);exception when raise_exception then failed=true;end;
 if not failed then raise exception 'Selected supplier cancellation accepted';end if;
 perform public.camber_quotes_api('workflow',jsonb_build_object('quotationId',qid,'state','ARCHIVED','expectedVersion',n+2),a);
 if not exists(select 1 from jsonb_array_elements(public.camber_quotation_summary()) x where x->>'id'=qid::text and x->>'status'='ARCHIVED' and not (x->>'attention')::boolean) then raise exception 'Summary status/attention failed';end if;
 insert into public.camber_quote_versions(request_id,version,response) values(rid,1,'{"total":100,"version":1}');
 insert into public.camber_purchase_orders(quotation_id,proposal_version_id,created_by)
 select qid,id,a from public.camber_quote_versions where request_id=rid and version=1;
 perform public.camber_quotes_api('workflow',jsonb_build_object('quotationId',qid,'state','TRASH','expectedVersion',n+3),a);
 if not exists(select 1 from public.camber_purchase_orders where quotation_id=qid) then raise exception 'Order lost';end if;
 perform public.camber_quotes_api('workflow',jsonb_build_object('quotationId',qid,'state','RESTORE','expectedVersion',n+4),a);
 if not exists(select 1 from public.camber_quotations where id=qid and workflow='ARCHIVED' and control_previous='CLOSED' and selected_request_id=rid) then raise exception 'Prior archive or selection lost';end if;
 perform public.camber_quotes_api('workflow',jsonb_build_object('quotationId',qid,'state','RESTORE','expectedVersion',n+5),a);
 if not exists(select 1 from public.camber_quotations where id=qid and workflow='CLOSED' and state='CLOSED') then raise exception 'Prior closed state lost';end if;
 if not exists(select 1 from public.camber_quote_requests where id=rid and response->>'total'='100') then raise exception 'Response lost';end if;
 if has_function_privilege('anon','public.camber_quotes_api(text,jsonb,uuid)','execute') or has_function_privilege('authenticated','public.camber_quotes_api(text,jsonb,uuid)','execute') then raise exception 'Public API permission exposed';end if;
end $$;
