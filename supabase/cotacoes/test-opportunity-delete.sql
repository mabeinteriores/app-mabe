begin;
do $$
declare a uuid;pid text='delete-qa-'||gen_random_uuid();qi uuid=gen_random_uuid();ri uuid=gen_random_uuid();vi uuid=gen_random_uuid();data jsonb;preview jsonb;failed boolean;before_projects jsonb;after_projects jsonb;events_count int;
begin
 select id into a from public.profiles where papel='admin' and ativo and aprovado limit 1;
 if a is null then raise exception 'Administrator required';end if;
 select value into before_projects from public.kv_store where workspace='mabe' and key='mabe-projects-v3';
 update public.kv_store set value=value||jsonb_build_array(jsonb_build_object('id',pid,'nome','QA exclusão isolada','op',3,'pct',50,'rt',999)) where workspace='mabe' and key='mabe-projects-v3';
 insert into public.kv_store(workspace,key,value) values('mabe','mabe-opps-v3-'||pid,'[{"id":1,"serv":"Alvo","val":100,"rt":10,"et":"prospec"},{"id":2,"serv":"Preservada","val":100,"rt":10,"et":"win"},{"id":3,"serv":"Perdida","val":200,"rt":10,"et":"lost"}]');
 begin perform public.camber_opportunity_delete('preview',jsonb_build_object('projectId',pid,'opportunityId','1'));raise exception 'Unauthorized call accepted';exception when insufficient_privilege then null;end;
 preview=public.camber_opportunity_delete('preview',jsonb_build_object('projectId',pid,'opportunityId','1'),a);
 if preview->>'blocked'<>'false' or preview->>'service'<>'Alvo' then raise exception 'Preview failed';end if;
 -- Concurrent edits must prevent stale confirmation.
 update public.kv_store set value=jsonb_set(value,'{0,val}','101') where workspace='mabe' and key='mabe-opps-v3-'||pid;
 failed=false;begin perform public.camber_opportunity_delete('delete',jsonb_build_object('projectId',pid,'opportunityId','1','version',preview->>'version'),a);exception when raise_exception then failed=true;end;
 if not failed then raise exception 'Stale confirmation accepted';end if;
 preview=public.camber_opportunity_delete('preview',jsonb_build_object('projectId',pid,'opportunityId','1'),a);
 data=public.camber_opportunity_delete('delete',jsonb_build_object('projectId',pid,'opportunityId','1','version',preview->>'version'),a);
 if data->>'deleted'<>'true' then raise exception 'Deletion failed';end if;
 select value into data from public.kv_store where workspace='mabe' and key='mabe-opps-v3-'||pid;
 if jsonb_array_length(data)<>2 or data#>>'{0,serv}'<>'Preservada' or data#>>'{1,serv}'<>'Perdida' then raise exception 'Another opportunity was modified';end if;
 select x into data from public.kv_store,jsonb_array_elements(value) x where workspace='mabe' and key='mabe-projects-v3' and x->>'id'=pid;
 if data->>'op'<>'2' or data->>'pct'<>'100' or data->>'rt'<>'10' then raise exception 'Totals incorrect: %',data;end if;
 data=public.camber_opportunity_delete('delete',jsonb_build_object('projectId',pid,'opportunityId','1','version',preview->>'version'),a);
 if data->>'alreadyDeleted'<>'true' then raise exception 'Retry not idempotent';end if;
 -- Linked requests must be canceled, never erased, including their supplier response.
 update public.kv_store set value=value||'[{"id":4,"serv":"Com cotação","val":50,"rt":5,"et":"prospec","proposals":[]}]' where workspace='mabe' and key='mabe-opps-v3-'||pid;
 insert into public.camber_quotations(id,project_id,opportunity_id,specification,expires_at,created_by) values(qi,pid,'4','{}',now()+interval '1 day',a);
 insert into public.camber_quote_requests(id,project_id,opportunity_id,proposal_id,supplier_id,supplier_name,project_name,service,specification,created_by,expires_at,quotation_id,response)
 values(ri,pid,'4','proposal','qa-supplier','Fornecedor QA','QA exclusão isolada','Com cotação','{}',a,now()+interval '1 day',qi,'{"version":1,"total":50}');
 preview=public.camber_opportunity_delete('preview',jsonb_build_object('projectId',pid,'opportunityId','4'),a);
 if preview->>'quotations'<>'1' or preview->>'requests'<>'1' then raise exception 'Linked counts missing';end if;
 -- A selected supplier and a purchase must both block deletion.
 update public.camber_quotations set selected_request_id=ri where id=qi;
 if (public.camber_opportunity_delete('preview',jsonb_build_object('projectId',pid,'opportunityId','4'),a)->>'blocked')<>'true' then raise exception 'Selected supplier not protected';end if;
 failed=false;begin perform public.camber_opportunity_delete('delete',jsonb_build_object('projectId',pid,'opportunityId','4','version',preview->>'version'),a);exception when raise_exception then failed=true;end;
 if not failed then raise exception 'Selected supplier deleted';end if;
 update public.camber_quotations set selected_request_id=null where id=qi;
 insert into public.camber_quote_versions(id,request_id,version,response) values(vi,ri,1,'{"total":50}');
 insert into public.camber_purchase_orders(quotation_id,proposal_version_id,created_by) values(qi,vi,a);
 if (public.camber_opportunity_delete('preview',jsonb_build_object('projectId',pid,'opportunityId','4'),a)->>'blocked')<>'true' then raise exception 'Purchase not protected';end if;
 -- This fixture purchase is transaction-only and is rolled back with the entire test.
 delete from public.camber_purchase_orders where quotation_id=qi;
 preview=public.camber_opportunity_delete('preview',jsonb_build_object('projectId',pid,'opportunityId','4'),a);
 perform public.camber_opportunity_delete('delete',jsonb_build_object('projectId',pid,'opportunityId','4','version',preview->>'version'),a);
 if not exists(select 1 from public.camber_quotations where id=qi and state='CLOSED' and workflow='CANCELED') then raise exception 'Quotation not canceled';end if;
 if not exists(select 1 from public.camber_quote_requests where id=ri and active=false and response->>'total'='50') then raise exception 'Request history lost or link still active';end if;
 if not exists(select 1 from public.camber_quote_versions where id=vi) then raise exception 'Version lost';end if;
 failed=false;begin perform public.camber_quotes_api('lookup',jsonb_build_object('token',(select token from public.camber_quote_requests where id=ri)));exception when raise_exception then failed=true;end;
 if not failed then raise exception 'Supplier link still available';end if;
 select count(*) into events_count from public.camber_quote_events where quotation_id=qi and event like 'Oportunidade excluída:%';
 if events_count<>1 then raise exception 'Audit event missing';end if;
 perform public.camber_opportunity_delete('delete',jsonb_build_object('projectId',pid,'opportunityId','4','version',preview->>'version'),a);
 if (select count(*) from public.camber_quote_events where quotation_id=qi and event like 'Oportunidade excluída:%')<>events_count then raise exception 'Retry duplicated event';end if;
 select coalesce(jsonb_agg(x order by ord),'[]') into after_projects from public.kv_store,jsonb_array_elements(value) with ordinality t(x,ord) where workspace='mabe' and key='mabe-projects-v3' and x->>'id' is distinct from pid;
 if after_projects is distinct from before_projects then raise exception 'Unrelated projects changed';end if;
 if has_function_privilege('anon','public.camber_opportunity_delete(text,jsonb,uuid)','execute') or has_function_privilege('authenticated','public.camber_opportunity_delete(text,jsonb,uuid)','execute') then raise exception 'Browser RPC access exposed';end if;
end $$;
rollback;
select 'PASS: exclusão pontual, totais, concorrência, cancelamento de links, histórico, fornecedor escolhido, compra, permissões e repetição. Dados de teste revertidos.' result;
