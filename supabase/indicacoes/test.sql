-- All fixtures and history writes are rolled back. No test customer remains.
begin;
do $$
declare a uuid; p jsonb; link jsonb; token text; result jsonb; r jsonb; v jsonb; num integer;
begin
 select id into a from public.profiles where papel='admin' and ativo and aprovado limit 1;
 if a is null then raise exception 'Missing active administrator for transactional test';end if;
 update public.kv_store set value=jsonb_set(value,'{corretores}',value->'corretores'||'[ {"id":9007199254740990,"nome":"Corretor QA temporário","imob":"Imobiliária QA"} ]'::jsonb) where workspace='mabe' and key='mabe_ind';
 link:=public.camber_referrals_api('link','{"partnerId":"9007199254740990","mode":"create"}',a);token:=link->>'token';
 result:=public.camber_referrals_api('lookup',jsonb_build_object('token',token));
 if result->>'name'<>'Corretor QA temporário' or result ? 'state' then raise exception 'Lookup leak or wrong partner';end if;
 p:=jsonb_build_object('token',token,'name','Cliente QA temporário','phone','11987654321','email','qa-referral@example.invalid','consent',true,'requestId','qa-request-000000000001','bucket','qa');
 result:=public.camber_referrals_api('submit',p-'consent');if not result ? 'error' then raise exception 'Consent bypass';end if;
 result:=public.camber_referrals_api('submit',p||'{"phone":"123"}');if not result ? 'error' then raise exception 'Invalid phone accepted';end if;
 result:=public.camber_referrals_api('submit',p||'{"name":"<img src=x onerror=alert(1)>"}');if not result ? 'error' then raise exception 'Markup accepted';end if;
 result:=public.camber_referrals_api('submit',p);if result->>'ok'<>'true' then raise exception 'Submit failed: %',result;end if;
 perform public.camber_referrals_api('submit',p);
 perform public.camber_referrals_api('submit',p||'{"requestId":"qa-request-000000000002","phone":"+55 (11) 98765-4321"}');
 perform public.camber_referrals_api('submit',p||'{"requestId":"qa-request-000000000003","phone":"11987654322"}');
 select value into v from public.kv_store where workspace='mabe' and key='mabe_ind';
 select count(*) into num from jsonb_array_elements(v->'indicacoes') x where x->>'publicRequestId' like 'qa-request-%';
 if num<>1 then raise exception 'Idempotency/phone/email duplicate failed: %',num;end if;
 select x into r from jsonb_array_elements(v->'indicacoes') x where x->>'publicRequestId'='qa-request-000000000001';
 if r->>'corretorId'<>'9007199254740990' then raise exception 'Origin failed';end if;
 begin perform public.camber_referrals_api('read','{}',null);raise exception 'Unauthorized read succeeded';exception when insufficient_privilege then null;end;
 result:=public.camber_referrals_api('update',jsonb_build_object('id',r->>'id','revision',1,'status','Contato Feito','ownerId',a,'nextAction','Telefonar','nextActionDate',current_date+1,'value',50000),a);
 if result->>'revision'<>'2' or jsonb_array_length(result->'logs')<>2 then raise exception 'Update/history failed';end if;
 begin
  perform public.camber_referrals_api('update',jsonb_build_object('id',r->>'id','revision',1),a);raise exception 'Expected conflict missing';
 exception when raise_exception then if SQLERRM not like 'Outro usuário%' then raise;end if;end;
 result:=public.camber_referrals_api('update',jsonb_build_object('id',r->>'id','revision',2,'status','Fechado','ownerId',a,'nextAction','','nextActionDate','','value',50000),a);
 if result->>'commRate' is null then raise exception 'Commission snapshot missing';end if;
 result:=public.camber_referrals_api('payment',jsonb_build_object('id',r->>'id','revision',3),a);
 if result->>'paymentStatus'<>'Liberada' then raise exception 'Release failed';end if;
 result:=public.camber_referrals_api('payment',jsonb_build_object('id',r->>'id','revision',4,'reference','TESTE TRANSACIONAL'),a);
 if result->>'paymentStatus'<>'Paga' or result->>'paidBy'<>a::text then raise exception 'Payment audit failed';end if;
 result:=public.camber_referrals_api('archive',jsonb_build_object('id',r->>'id','revision',5),a);
 if result->>'archived'<>'true' then raise exception 'Archive failed';end if;
 result:=public.camber_referrals_api('archive',jsonb_build_object('id',r->>'id','revision',6),a);
 if result->>'archived'<>'false' then raise exception 'Restore failed';end if;
 perform public.camber_referrals_api('link','{"partnerId":"9007199254740990","mode":"toggle"}',a);
 result:=public.camber_referrals_api('lookup',jsonb_build_object('token',token));if not result ? 'error' then raise exception 'Disabled link still works';end if;
 perform public.camber_referrals_api('link','{"partnerId":"9007199254740990","mode":"rotate"}',a);
 result:=public.camber_referrals_api('lookup',jsonb_build_object('token',token));if not result ? 'error' then raise exception 'Rotated link still works';end if;
end $$;
select 'PASS: consent, validation, origin, idempotency, phone/email duplicates, access, update, audit, conflict, commission, archive/restore, disabled/rotated link' as result;
rollback;
