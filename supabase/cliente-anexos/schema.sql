insert into storage.buckets(id,name,public,file_size_limit)
values('cliente-anexos','cliente-anexos',false,26214400);
create table public.cliente_anexos (
 id uuid primary key default gen_random_uuid(),
 cliente_id text,
 convite_token text references public.cliente_convites(token) on delete set null,
 categoria text not null check(categoria in ('contrato','planta','referencias')),
 nome text not null check(length(nome) between 1 and 250),
 caminho text not null unique,
 tamanho bigint not null,
 content_type text,
 criado_em timestamptz not null default now()
);
create index cliente_anexos_cliente on public.cliente_anexos(cliente_id,categoria);
create index cliente_anexos_convite on public.cliente_anexos(convite_token);
alter table public.cliente_anexos enable row level security;
revoke all on public.cliente_anexos from public,anon,authenticated;
grant select on public.cliente_anexos to authenticated;
create policy cliente_anexos_equipe on public.cliente_anexos for select to authenticated using(public.is_aprovado());

create function public.cliente_planta_upload_permitido(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cliente_convites c
 where p_path='convites/'||c.token||'/planta' and c.status='pendente'
 and c.created_at>now()-interval '20 days');
$$;
revoke all on function public.cliente_planta_upload_permitido(text) from public;
grant execute on function public.cliente_planta_upload_permitido(text) to anon,authenticated;
create policy cliente_anexos_upload_convite on storage.objects for insert to anon,authenticated
with check(bucket_id='cliente-anexos' and public.cliente_planta_upload_permitido(name));
create policy cliente_anexos_upload_equipe on storage.objects for insert to authenticated
with check(bucket_id='cliente-anexos' and public.is_aprovado() and (storage.foldername(name))[1]='clientes');
create policy cliente_anexos_ler_equipe on storage.objects for select to authenticated
using(bucket_id='cliente-anexos' and public.is_aprovado());

create function public.registrar_anexo_cliente(p_path text,p_nome text,p_cliente_id text default null,p_categoria text default 'planta',p_token text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare obj storage.objects; result_id uuid;
begin
 if p_token is not null then
   if not public.cliente_planta_upload_permitido(p_path) or p_path<>'convites/'||p_token||'/planta' or p_categoria<>'planta' or p_cliente_id is not null then raise exception 'Convite inválido'; end if;
 else
   if auth.uid() is null or not public.is_aprovado() then raise exception 'Sem permissão'; end if;
   if p_path not like 'clientes/'||p_cliente_id||'/%' or p_cliente_id is null then raise exception 'Cliente inválido'; end if;
   if not exists(select 1 from public.kv_store k cross join lateral jsonb_array_elements(k.value) c where k.workspace='mabe' and k.key='mabe-clientes-v1' and c->>'id'=p_cliente_id) then raise exception 'Cliente não cadastrado'; end if;
 end if;
 select * into obj from storage.objects where bucket_id='cliente-anexos' and name=p_path;
 if not found then raise exception 'Arquivo não enviado'; end if;
 insert into public.cliente_anexos(cliente_id,convite_token,categoria,nome,caminho,tamanho,content_type)
 values(p_cliente_id,p_token,p_categoria,p_nome,p_path,coalesce((obj.metadata->>'size')::bigint,0),obj.metadata->>'mimetype')
 on conflict(caminho) do nothing returning id into result_id;
 if result_id is null then select id into result_id from public.cliente_anexos where caminho=p_path; end if;
 return result_id;
end $$;
revoke all on function public.registrar_anexo_cliente(text,text,text,text,text) from public;
grant execute on function public.registrar_anexo_cliente(text,text,text,text,text) to anon,authenticated;

create function public.vincular_anexos_cliente(p_token text,p_cliente_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare convite public.cliente_convites; cliente jsonb;
begin
 if auth.uid() is null or not public.is_aprovado() then raise exception 'Sem permissão'; end if;
 select * into convite from public.cliente_convites where token=p_token for update;
 if not found or convite.status not in ('respondido','cadastrado') then raise exception 'Convite indisponível'; end if;
 select c into cliente from public.kv_store k cross join lateral jsonb_array_elements(k.value) c where k.workspace='mabe' and k.key='mabe-clientes-v1' and c->>'id'=p_cliente_id;
 if cliente is null or regexp_replace(coalesce(cliente->>'doc',''),'[^0-9]','','g')='' or regexp_replace(cliente->>'doc','[^0-9]','','g') is distinct from regexp_replace(convite.dados->>'doc','[^0-9]','','g') then raise exception 'O cliente não corresponde ao convite'; end if;
 if exists(select 1 from public.cliente_anexos where convite_token=p_token and cliente_id is not null and cliente_id<>p_cliente_id) then raise exception 'Convite já vinculado'; end if;
 update public.cliente_anexos set cliente_id=p_cliente_id where convite_token=p_token;
 update public.cliente_convites set status='cadastrado' where token=p_token;
 return true;
end $$;
revoke all on function public.vincular_anexos_cliente(text,text) from public,anon;
grant execute on function public.vincular_anexos_cliente(text,text) to authenticated;
