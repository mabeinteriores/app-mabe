begin;
do $qa$
declare d jsonb='{"doc":"12.ABC.345/01DE-35","email":"qa@example.invalid","tel":"+55 (51) 91234-5678","cep":"90000-001","uf":"RS"}';
 catalog jsonb=public.get_servicos_publico(); kind text;rpc regprocedure;
begin
 if jsonb_array_length(catalog)>0 then
  d=d||jsonb_build_object('categorias',jsonb_build_array(catalog->0));
  if public.camber_convite_erro(d,true) is not null then raise exception 'Valid supplier rejected';end if;
 end if;
 if public.camber_convite_erro(d||'{"doc":"529.982.247-25"}',false) is not null then raise exception 'Valid CPF rejected';end if;
 if public.camber_convite_erro(d||'{"doc":"123"}',true) is distinct from 'cnpj_invalido' then raise exception 'Short CNPJ accepted';end if;
 if public.camber_convite_erro(d||'{"doc":"12345678901"}',false) is distinct from 'documento_invalido' then raise exception 'Invalid CPF accepted';end if;
 if public.camber_convite_erro(d||'{"email":"not-an-email"}',false) is distinct from 'email_invalido' then raise exception 'Invalid email accepted';end if;
 if public.camber_convite_erro(d||'{"tel":"x"}',false) is distinct from 'telefone_invalido' then raise exception 'Invalid phone accepted';end if;
 if public.camber_convite_erro(d||'{"cep":"abc"}',false) is distinct from 'cep_invalido' then raise exception 'Invalid CEP accepted';end if;
 if public.camber_convite_erro(d||'{"uf":"ZZ"}',false) is distinct from 'uf_invalida' then raise exception 'Invalid UF accepted';end if;
 if public.camber_convite_erro(d||'{"categorias":["Serviço inexistente QA 41b73e79"]}',true) is distinct from 'categoria_invalida' then raise exception 'Unknown service accepted';end if;
 foreach kind in array array['cliente','fornecedor'] loop
  rpc=format('public.responder_convite_%s(text,jsonb)',kind)::regprocedure;
  if strpos(pg_get_functiondef(rpc),'public.camber_convite_erro(')=0 or not has_function_privilege('anon',rpc,'execute') then raise exception 'Public invitation integration not installed';end if;
 end loop;
 if has_function_privilege('anon','public.camber_convite_erro(jsonb,boolean)','execute') or has_function_privilege('authenticated','public.camber_convite_erro(jsonb,boolean)','execute') then raise exception 'Unexpected direct helper access';end if;
end $qa$;
rollback;
select 'PASS: valid and invalid identifiers, phone, CEP, UF, email, catalog, both RPCs and permissions. No submissions or notifications.' result;
