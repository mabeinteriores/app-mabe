-- Service-only API: public forms never receive access to tables or internal data.
create table if not exists public.referral_links (
 partner_id bigint primary key, token uuid not null unique default gen_random_uuid(),
 active boolean not null default true, updated_at timestamptz not null default now(), updated_by uuid
);
create table if not exists public.referral_limits (
 bucket text primary key, hits integer not null, expires_at timestamptz not null
);
alter table public.referral_links enable row level security;
alter table public.referral_limits enable row level security;
revoke all on public.referral_links,public.referral_limits from public,anon,authenticated;
grant all on public.referral_links,public.referral_limits to service_role;

create or replace function public.referral_phone(raw text) returns text
language plpgsql immutable security invoker set search_path='' as $$
declare n text:=regexp_replace(coalesce(raw,''),'[^0-9]','','g');
begin
 if length(n) in (12,13) and left(n,2)='55' then n:=substr(n,3);end if;
 if n !~ '^([1-9][0-9])([2-5][0-9]{7}|9[0-9]{8})$' then raise exception 'Telefone inválido. Informe o DDD.';end if;
 return '+55'||n;
end $$;
revoke all on function public.referral_phone(text) from public,anon,authenticated;
grant execute on function public.referral_phone(text) to service_role;

create or replace function public.camber_referrals_api(action text,payload jsonb default '{}',actor uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 s jsonb; person jsonb; r jsonb; old_r jsonb; idx integer; linkrow public.referral_links%rowtype;
 profile public.profiles%rowtype; owner public.profiles%rowtype;
 n text; email text; token_value uuid; rid bigint; hits integer; response jsonb;
 today_local date:=(now() at time zone 'America/Sao_Paulo')::date;
 rate numeric; amount numeric; f jsonb; request_key text; existing jsonb; event_note text;
begin
 if action not in ('lookup','submit') then
  select * into profile from public.profiles where id=actor and ativo and aprovado
    and (papel='admin' or 'indicacoes'=any(abas_permitidas));
  if not found then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 end if;
 if action in ('lookup','submit') then
  begin token_value:=(payload->>'token')::uuid;exception when others then return jsonb_build_object('error','Link indisponível. Solicite um novo link ao corretor.');end;
  select * into linkrow from public.referral_links where token=token_value and active;
  if not found then return jsonb_build_object('error','Link indisponível. Solicite um novo link ao corretor.');end if;
 end if;
 -- All writes share a row lock with the legacy compare-and-swap writer.
 select value into s from public.kv_store where workspace='mabe' and key='mabe_ind' for update;
 if s is null then raise exception 'Cadastre os parceiros antes de continuar.';end if;
 if action='read' then
  return jsonb_build_object('state',s,'admin',profile.papel='admin',
   'users',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome)),'[]') from public.profiles where ativo and aprovado),
   'links',(select coalesce(jsonb_agg(to_jsonb(l)),'[]') from public.referral_links l));
 end if;
 if action in ('link','lookup','submit') then
  select x into person from jsonb_array_elements(coalesce(s->'corretores','[]')) x
    where x->>'id'=case when action='link' then payload->>'partnerId' else linkrow.partner_id::text end;
  if person is null or person->>'ativo'='false' or person->>'status'='Inativo' then
   return jsonb_build_object('error','Corretor indisponível.');
  end if;
 end if;
 if action='link' then
  if coalesce(payload->>'mode','') not in ('create','toggle','rotate') then raise exception 'Operação inválida.';end if;
  insert into public.referral_links(partner_id,updated_by) values((person->>'id')::bigint,actor) on conflict do nothing;
  if payload->>'mode'='rotate' then update public.referral_links set token=gen_random_uuid(),active=true,updated_at=now(),updated_by=actor where partner_id=(person->>'id')::bigint;
  elsif payload->>'mode'='toggle' then update public.referral_links set active=not active,updated_at=now(),updated_by=actor where partner_id=(person->>'id')::bigint;end if;
  return (select to_jsonb(l) from public.referral_links l where partner_id=(person->>'id')::bigint);
 end if;
 if action='lookup' then return jsonb_build_object('name',person->>'nome','agency',coalesce(person->>'imob',''));end if;
 if action='submit' then
  -- Serialize link revocation with incoming submissions; lock order is always kv then link.
  select * into linkrow from public.referral_links where token=token_value and active for update;
  if not found then return jsonb_build_object('error','Link indisponível.');end if;
  delete from public.referral_limits where expires_at<now();
  insert into public.referral_limits(bucket,hits,expires_at)
   values(coalesce(payload->>'bucket','unknown')||':'||to_char(now(),'YYYY-MM-DD-HH24'),1,now()+interval '2 hours')
   on conflict(bucket) do update set hits=referral_limits.hits+1 returning referral_limits.hits into hits;
  if hits>20 then return jsonb_build_object('error','Muitos envios. Tente novamente mais tarde.');end if;
  if coalesce(payload->>'consent','')<>'true' or coalesce(payload->>'website','')<>'' then return jsonb_build_object('error','Confirme a autorização do cliente.');end if;
  if length(trim(coalesce(payload->>'name','')))<2 or length(payload->>'name')>100
    or length(coalesce(payload->>'notes',''))>1000 or (coalesce(payload->>'name','')||coalesce(payload->>'notes','')) ~ '[<>]' then
   return jsonb_build_object('error','Confira o nome e as observações. Não use marcação HTML.');end if;
  begin n:=public.referral_phone(payload->>'phone');exception when others then return jsonb_build_object('error','Informe um telefone válido com DDD.');end;
  email:=lower(trim(coalesce(payload->>'email','')));
  if length(email)>200 or (email<>'' and email !~ '^[^[:space:]<>@]+@[^[:space:]<>@]+[.][^[:space:]<>@]+$') then return jsonb_build_object('error','Informe um e-mail válido.');end if;
  request_key:=payload->>'requestId';
  if coalesce(request_key,'') !~ '^[a-zA-Z0-9-]{16,80}$' then return jsonb_build_object('error','Recarregue a página e tente novamente.');end if;
  -- No personal data or duplicate lookup information is returned to anonymous callers.
  if exists(select 1 from jsonb_array_elements(coalesce(s->'indicacoes','[]')) x where x->>'publicRequestId'=request_key and x->>'corretorId'=linkrow.partner_id::text) then return jsonb_build_object('ok',true);end if;
  if exists(select 1 from jsonb_array_elements(coalesce(s->'indicacoes','[]')) x where
    regexp_replace(x->>'clienteTel','[^0-9]','','g') in (substr(n,2),substr(n,4)) or (email<>'' and lower(x->>'clienteEmail')=email)) then
   return jsonb_build_object('ok',true);end if;
  rid:=floor(random()*9007199254740000)::bigint;
  while exists(select 1 from jsonb_array_elements(coalesce(s->'indicacoes','[]')) x where x->>'id'=rid::text) loop rid:=floor(random()*9007199254740000)::bigint;end loop;
  r:=jsonb_build_object('id',rid,'corretorId',linkrow.partner_id,'partnerType','Corretor','partnerName',person->>'nome','imobId',person->'imobId',
   'clienteNome',trim(payload->>'name'),'clienteTel',n,'clienteEmail',email,'tipoImovel','','contexto',coalesce(payload->>'notes',''),'obs','',
   'valorEstimado',0,'valorReal',null,'status','Novo Lead','dataRegistro',today_local,'createdAt',now(),'source','broker-link','publicRequestId',request_key,
   'consentAt',now(),'consentText','Cliente autorizou o compartilhamento dos dados com a Camber para contato sobre o projeto.',
   'nextAction','Fazer primeiro contato','nextActionDate',today_local+1,'revision',1,
   'logs',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'data',now(),'status','Novo Lead','userName','Link de '||(person->>'nome'),'nota','Indicação recebida pelo link fixo do corretor.','tipo','blue')));
  s:=jsonb_set(s,'{indicacoes}',coalesce(s->'indicacoes','[]')||jsonb_build_array(r));
 elsif action in ('update','payment','archive') then
  select x,ord::integer-1 into r,idx from jsonb_array_elements(coalesce(s->'indicacoes','[]')) with ordinality a(x,ord) where x->>'id'=payload->>'id';
  if r is null then raise exception 'Indicação não encontrada.';end if;
  old_r:=r;
  if coalesce((r->>'revision')::integer,0)<>coalesce((payload->>'revision')::integer,-1) then raise exception 'Outro usuário alterou esta ficha. Atualize a página antes de salvar.';end if;
  if action='update' then
   if coalesce(payload->>'status','') not in ('Novo Lead','Contato Feito','Reunião Agendada','Proposta Enviada','Fechado','Perdido') then raise exception 'Status inválido.';end if;
   if coalesce(payload->>'ownerId','')<>'' then
    select * into owner from public.profiles where id=(payload->>'ownerId')::uuid and ativo and aprovado;
    if not found then raise exception 'Selecione um responsável ativo.';end if;
   end if;
   if length(coalesce(payload->>'nextAction',''))>200 or coalesce(payload->>'nextAction','') ~ '[<>]' then raise exception 'Próxima ação inválida.';end if;
   if payload->>'status' not in ('Fechado','Perdido') and (trim(coalesce(payload->>'nextAction',''))='' or coalesce(payload->>'nextActionDate','')='') then raise exception 'Informe a próxima ação e sua data.';end if;
   if coalesce(payload->>'nextActionDate','')<>'' then perform (payload->>'nextActionDate')::date;end if;
   amount:=coalesce((payload->>'value')::numeric,0);
   if amount<0 or amount>1000000000 then raise exception 'Valor inválido.';end if;
   if payload->>'status'='Fechado' and amount<=0 then raise exception 'Informe o valor do contrato fechado.';end if;
   if r->>'paymentStatus'='Paga' and (payload->>'status'<>'Fechado' or amount<>(r->>'valorReal')::numeric) then raise exception 'Este contrato já tem comissão paga. Mantenha o status e valor registrados.';end if;
   r:=r||jsonb_build_object('status',payload->>'status','ownerId',owner.id,'ownerName',owner.nome,'nextAction',trim(payload->>'nextAction'),'nextActionDate',nullif(payload->>'nextActionDate',''),'valorEstimado',amount);
   if payload->>'status'='Fechado' then
    rate:=(r->>'commRate')::numeric;
    if rate is null then
     for f in select x from jsonb_array_elements(s#>'{config,faixas}') x loop
      if f->>'ate' is null or amount<=(f->>'ate')::numeric then rate:=(f->>'pct')::numeric/100;exit;end if;
     end loop;
    end if;
    if rate is null or rate<0 or rate>1 then raise exception 'Confira a regra de comissão antes de fechar.';end if;
    r:=r||jsonb_build_object('valorReal',amount,'commRate',rate,'paymentStatus',coalesce(r->>'paymentStatus','Prevista'));
   end if;
   event_note:='Acompanhamento atualizado. Responsável: '||coalesce(owner.nome,'Não atribuído')||'. Próxima ação: '||coalesce(payload->>'nextAction','')||' ('||coalesce(payload->>'nextActionDate','')||').';
  elsif action='payment' then
   if profile.papel<>'admin' then raise exception 'Somente administradores registram pagamentos.' using errcode='42501';end if;
   if r->>'status'<>'Fechado' then raise exception 'A indicação precisa estar fechada.';end if;
   if coalesce(r->>'paymentStatus','Prevista')='Prevista' then
    r:=r||jsonb_build_object('paymentStatus','Liberada','releasedAt',now(),'releasedBy',actor);
   elsif r->>'paymentStatus'='Liberada' then
    if length(trim(coalesce(payload->>'reference','')))<3 or length(payload->>'reference')>200 or payload->>'reference' ~ '[<>]' then raise exception 'Informe a referência do pagamento (3 a 200 caracteres).';end if;
    r:=r||jsonb_build_object('paymentStatus','Paga','paidAt',now(),'paidBy',actor,'paymentReference',trim(payload->>'reference'));
   else raise exception 'Pagamento já registrado.';end if;
   event_note:='Comissão '||(r->>'paymentStatus')||'. '||coalesce(payload->>'reference','');
  else
   r:=r||jsonb_build_object('archived',not coalesce((r->>'archived')::boolean,false));event_note:=case when r->>'archived'='true' then 'Indicação arquivada.' else 'Indicação restaurada.' end;
  end if;
  r:=r||jsonb_build_object('revision',coalesce((r->>'revision')::integer,0)+1,'updatedAt',now(),'updatedBy',actor,
   'logs',coalesce(r->'logs','[]')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'data',now(),'status',r->>'status','previousStatus',old_r->>'status','userId',actor,'userName',profile.nome,'nota',event_note,'tipo','default')));
  s:=jsonb_set(s,array['indicacoes',idx::text],r);
 else raise exception 'Operação desconhecida.';end if;
 update public.kv_store set value=s,updated_at=clock_timestamp(),updated_by=actor where workspace='mabe' and key='mabe_ind';
 return case when action='submit' then jsonb_build_object('ok',true) else r end;
end $$;
revoke all on function public.camber_referrals_api(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.camber_referrals_api(text,jsonb,uuid) to service_role;

-- Protect existing writers too: canonical contact uniqueness and per-record revisions.
create or replace function public.referral_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare r jsonb; old_r jsonb; rows jsonb:='[]'; phone text; email text; old_count integer; new_count integer; f jsonb;
begin
 if new.workspace<>'mabe' or new.key<>'mabe_ind' then return new;end if;
 for r in select x from jsonb_array_elements(coalesce(new.value->'indicacoes','[]')) x loop
  select x into old_r from jsonb_array_elements(coalesce(old.value->'indicacoes','[]')) x where x->>'id'=r->>'id';
  if old_r is distinct from r then
   phone:=regexp_replace(coalesce(r->>'clienteTel',''),'[^0-9]','','g');
   if length(phone) in (12,13) and left(phone,2)='55' then phone:=substr(phone,3);end if;
   email:=lower(trim(coalesce(r->>'clienteEmail','')));
   select count(*) into new_count from jsonb_array_elements(coalesce(new.value->'indicacoes','[]')) x where
    (phone<>'' and regexp_replace(x->>'clienteTel','[^0-9]','','g') in(phone,'55'||phone)) or (email<>'' and lower(trim(x->>'clienteEmail'))=email);
   select count(*) into old_count from jsonb_array_elements(coalesce(old.value->'indicacoes','[]')) x where
    (phone<>'' and regexp_replace(x->>'clienteTel','[^0-9]','','g') in(phone,'55'||phone)) or (email<>'' and lower(trim(x->>'clienteEmail'))=email);
   if new_count>1 and new_count>old_count then raise exception 'Telefone ou e-mail já possui uma indicação. Atualize a lista.';end if;
   if old_r->>'source'='broker-link' and (r->'corretorId' is distinct from old_r->'corretorId' or r->'partnerName' is distinct from old_r->'partnerName') then raise exception 'A origem do link não pode ser alterada.';end if;
   if old_r->>'paymentStatus'='Paga' and (r->'valorReal' is distinct from old_r->'valorReal' or r->'commRate' is distinct from old_r->'commRate' or r->'paymentStatus' is distinct from old_r->'paymentStatus' or r->'status' is distinct from old_r->'status') then raise exception 'Preserve os valores da comissão já paga.';end if;
   if r->>'status'='Fechado' and r->>'commRate' is null then
    for f in select x from jsonb_array_elements(coalesce(new.value#>'{config,faixas}','[]')) x loop
     if f->>'ate' is null or coalesce((r->>'valorReal')::numeric,0)<=(f->>'ate')::numeric then
      r:=r||jsonb_build_object('commRate',(f->>'pct')::numeric/100);exit;
     end if;
    end loop;
   end if;
   r:=r||jsonb_build_object('revision',greatest(coalesce((r->>'revision')::integer,0),coalesce((old_r->>'revision')::integer,0)+1));
  end if;
  rows:=rows||jsonb_build_array(r);
 end loop;
 new.value:=jsonb_set(new.value,'{indicacoes}',rows);
 return new;
end $$;
revoke all on function public.referral_guard() from public,anon,authenticated;
drop trigger if exists referral_guard on public.kv_store;
create trigger referral_guard before update on public.kv_store for each row execute function public.referral_guard();
