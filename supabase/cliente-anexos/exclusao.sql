-- O arquivo é removido pela API Storage antes do registro.
create policy cliente_anexos_excluir_equipe on storage.objects
for delete to authenticated
using(bucket_id='cliente-anexos' and public.is_aprovado());

grant delete on public.cliente_anexos to authenticated;
create policy cliente_anexos_excluir_equipe on public.cliente_anexos
for delete to authenticated
using(public.is_aprovado() and not exists (
 select 1 from storage.objects o
 where o.bucket_id='cliente-anexos' and o.name=cliente_anexos.caminho
));
