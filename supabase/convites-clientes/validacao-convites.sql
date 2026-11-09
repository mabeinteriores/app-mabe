-- The helpers run as the existing RPC owner; browsers keep their current privileges.
create or replace function public.camber_convite_erro(d jsonb, fornecedor boolean)
returns text language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare doc text=regexp_replace(upper(btrim(d->>'doc')),'[./[:space:]-]','','g');
 mail text=btrim(d->>'email');tel text=btrim(d->>'tel');cep text=btrim(d->>'cep');cpf boolean;
 n int;i int;s int;r int;catalog jsonb;
begin
 cpf=coalesce(doc ~ '^[0-9]{11}$',false);
 if doc is null or (cpf and fornecedor) or (not cpf and doc !~ '^[A-Z0-9]{12}[0-9]{2}$') or doc ~ '^(.)\1+$' then
  return case when fornecedor then 'cnpj_invalido' else 'documento_invalido' end;end if;
 for n in length(doc)-2..length(doc)-1 loop
  s=0;for i in 1..n loop s=s+(ascii(substr(doc,i,1))-48)*(case when cpf then n+2-i else 2+mod(n-i,8) end);end loop;
  r=mod(s,11);if (case when r<2 then 0 else 11-r end)<>(substr(doc,n+1,1))::int then return case when fornecedor then 'cnpj_invalido' else 'documento_invalido' end;end if;
 end loop;
 if mail is null or length(mail)>254 or mail !~ '^[^[:space:]@]+@[A-Za-z0-9-]+([.][A-Za-z0-9-]+)+$' then return 'email_invalido';end if;
 if tel is null or tel !~ '^[+]?[0-9() -]+$' then return 'telefone_invalido';end if;
 tel=regexp_replace(tel,'[^0-9]','','g');if length(tel)>11 and left(tel,2)='55' then tel=substr(tel,3);end if;
 if tel !~ '^[1-9][0-9]{9,10}$' or tel ~ '^([0-9])\1+$' then return 'telefone_invalido';end if;
 if cep is null or cep !~ '^[0-9]{5}-?[0-9]{3}$' or replace(cep,'-','')='00000000' then return 'cep_invalido';end if;
 if coalesce(upper(btrim(d->>'uf')),'') <> all(string_to_array('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO',' ')) then return 'uf_invalida';end if;
 if fornecedor then
  catalog=public.get_servicos_publico();
  if jsonb_typeof(d->'categorias') is distinct from 'array' then return 'categoria_invalida';end if;
  if jsonb_array_length(d->'categorias')=0 or exists(select 1 from jsonb_array_elements_text(d->'categorias') c(v) where v is null or not(catalog ? v)) then return 'categoria_invalida';end if;
 end if;
 return null;
end $$;
revoke all on function public.camber_convite_erro(jsonb,boolean) from public,anon,authenticated;

-- Keep the current notification configuration inside the database, never in this migration.
do $migration$
declare kind text;def text;anchor text;block text;oldcheck text;
begin
 foreach kind in array array['cliente','fornecedor'] loop
  def=pg_get_functiondef(format('public.responder_convite_%s(text,jsonb)',kind)::regprocedure);
  if strpos(def,'public.camber_convite_erro(')>0 then continue;end if;
  oldcheck=$old$  if length(regexp_replace(p_dados->>'doc','[^0-9]','','g')) not in (11,14) then return jsonb_build_object('ok',false,'erro','campos_obrigatorios'); end if;$old$;
  if kind='cliente' then
   if strpos(def,oldcheck)=0 then raise exception 'Unexpected client document validation';end if;
   def=replace(def,oldcheck,'');
  end if;
  anchor='  update public.'||kind||'_convites';
  if strpos(def,anchor)=0 then raise exception 'Unexpected invitation function';end if;
  block=format($code$  declare problem text=public.camber_convite_erro(p_dados,%L::boolean);
  begin
   if problem is not null then return jsonb_build_object('ok',false,'erro',problem);end if;
   p_dados=p_dados||jsonb_build_object('uf',upper(btrim(p_dados->>'uf')),'doc',upper(btrim(p_dados->>'doc')),'email',btrim(p_dados->>'email'));
   %s
  end;
$code$,kind='fornecedor',case when kind='fornecedor' then
   $body$p_dados=p_dados||jsonb_build_object('categoria',p_dados#>>'{categorias,0}');$body$
   else $body$p_dados=p_dados||jsonb_build_object('tipoPessoa',case when length(regexp_replace(p_dados->>'doc','[./[:space:]-]','','g'))=11 then 'pf' else 'pj' end);$body$ end);
  execute replace(def,anchor,block||anchor);
 end loop;
end $migration$;

create or replace function public.get_servicos_publico() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x->>'nome' order by idx),'[]') from public.kv_store k
 cross join lateral jsonb_array_elements(case when jsonb_typeof(k.value->'servicos')='array' then k.value->'servicos' else '[]'::jsonb end) with ordinality s(x,idx)
 where k.workspace='mabe' and k.key='mabe-config-v1' and btrim(coalesce(x->>'nome',''))<>'';
$$;
-- Preserve letters when matching client attachments, including old formatted documents.
do $link$
declare d text=pg_get_functiondef('public.vincular_anexos_cliente(text,text)'::regprocedure);
begin
 if strpos(d,'''[^0-9]''')>0 then
  d=replace(d,$old$regexp_replace(coalesce(cliente->>'doc',''),'[^0-9]','','g')$old$,$new$regexp_replace(upper(coalesce(cliente->>'doc','')),'[./[:space:]-]','','g')$new$);
  d=replace(d,$old$regexp_replace(cliente->>'doc','[^0-9]','','g')$old$,$new$regexp_replace(upper(cliente->>'doc'),'[./[:space:]-]','','g')$new$);
  d=replace(d,$old$regexp_replace(convite.dados->>'doc','[^0-9]','','g')$old$,$new$regexp_replace(upper(convite.dados->>'doc'),'[./[:space:]-]','','g')$new$);
  if strpos(d,'''[^0-9]''')>0 then raise exception 'Unexpected attachment document check';end if;
  execute d;
 end if;
end $link$;
