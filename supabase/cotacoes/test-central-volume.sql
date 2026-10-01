-- All synthetic records are rolled back. No files or emails are created.
begin;
set local statement_timeout='20s';
do $$
declare a uuid; result jsonb; started timestamptz;
begin
 select id into a from public.profiles where papel='admin' and ativo and aprovado limit 1;
 insert into public.camber_quotations(id,project_id,opportunity_id,specification,expires_at,created_by,estimated_value)
 select gen_random_uuid(),'cq-volume-qa',n::text,'{"title":"Teste isolado","items":[]}',now()+interval '14 days',a,180000 from generate_series(1,1000) n;
 insert into public.camber_quote_requests(id,quotation_id,project_id,opportunity_id,proposal_id,supplier_id,supplier_name,project_name,service,specification,created_by,expires_at,response,status)
 select gen_random_uuid(),q.id,q.project_id,q.opportunity_id,'proposal-'||s,'supplier-'||s,
 case s when 1 then 'Atual Design' when 2 then 'Finger' else 'SCA' end,'Teste isolado de volume','Marcenaria',q.specification,a,q.expires_at,
 case when s<3 then '{"version":1,"total":150000}'::jsonb else null end,case when s<3 then 'SUBMITTED' else 'INVITED' end
 from public.camber_quotations q cross join generate_series(1,3) s where q.project_id='cq-volume-qa';
 started=clock_timestamp();
 result=public.camber_quotes_api('dashboard','{"page":20,"pageSize":25,"filters":{"projectId":"cq-volume-qa"}}',a);
 if result->>'total'<>'1000' or jsonb_array_length(result->'rows')<>25 or result#>>'{rows,0,received}'<>'2' or result#>>'{rows,0,awaiting}'<>'1' then raise exception 'Volume pagination failed';end if;
 if clock_timestamp()-started>interval '5 seconds' then raise exception 'Central query exceeded 5 seconds';end if;
 result=public.camber_quotes_api('dashboard','{"page":999999999,"pageSize":5000,"filters":{"projectId":"cq-volume-qa"}}',a);
 if result->>'pageSize'<>'100' or result->>'page'<>'10' or jsonb_array_length(result->'rows')<>100 then raise exception 'Pagination bounds failed';end if;
end $$;
rollback;
select 'Passed: 1000 synthetic quotations / 3000 participants, 25-row page, bounded page size and page overflow, database query under 5 seconds. All fixtures rolled back.' result;
