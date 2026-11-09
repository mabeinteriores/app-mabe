-- Order edits apply only to the purchase order. The selected proposal is immutable.
alter table public.camber_purchase_orders
 add column if not exists order_total numeric(16,2),
 add column if not exists order_payment_terms jsonb,
 add column if not exists order_content jsonb,
 add column if not exists order_notes text not null default '',
 add column if not exists deleted_at timestamptz,
 add column if not exists edit_version integer not null default 0,
 add column if not exists last_mutation uuid;

create or replace function public.camber_purchase_change(payload jsonb,actor uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 po public.camber_purchase_orders%rowtype;
 op text=payload->>'operation'; mutation uuid=(payload->>'mutationId')::uuid;
 amount numeric; delivery date; confirmed date; terms jsonb; note text; project_key text;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and ativo and aprovado and (papel='admin' or 'projetos'=any(abas_permitidas))) then
  raise exception 'Acesso não autorizado.' using errcode='42501';
 end if;
 if op is null or op not in ('edit','trash','restore') or mutation is null then raise exception 'Operação de compra inválida.';end if;
 select q.project_id into project_key from public.camber_purchase_orders p join public.camber_quotations q on q.id=p.quotation_id where p.id=(payload->>'id')::uuid;
 if not found then raise exception 'Pedido de compra não encontrado.';end if;
 perform pg_advisory_xact_lock(hashtextextended('camber-quotes-'||project_key,0));
 select * into strict po from public.camber_purchase_orders where id=(payload->>'id')::uuid for update;
 if po.last_mutation=mutation then return jsonb_build_object('ok',true,'version',po.edit_version);end if;
 if (payload->>'expectedVersion')::int is distinct from po.edit_version then
  raise exception 'Este pedido foi alterado. Atualize a lista e abra o pedido novamente.';
 end if;
 if (op='restore') is distinct from (po.deleted_at is not null) then
  raise exception 'A situação deste pedido mudou. Atualize a lista.';
 end if;
 if op='edit' then
  if not (payload ?& array['total','paymentTerms','expectedDelivery','notes','content','confirmedDelivery','orderState','paymentState','deliveryState','installationState']) then raise exception 'Confira os campos do pedido.';end if;
  if jsonb_typeof(payload#>'{content,items}') is distinct from 'array' then raise exception 'Confira os itens do pedido.';end if;
  if not coalesce(payload->>'orderState'=po.state or payload->>'orderState' in ('PENDING_APPROVAL','APPROVED','REJECTED'),false)
    or not coalesce(payload->>'paymentState'=po.payment_state or payload->>'paymentState' in ('PENDING','PARTIAL','PAID'),false)
    or not coalesce(payload->>'deliveryState'=po.delivery_state or payload->>'deliveryState' in ('PENDING','SCHEDULED','IN_TRANSIT','DELIVERED'),false)
    or not coalesce(payload->>'installationState'=po.installation_state or payload->>'installationState' in ('PENDING','SCHEDULED','IN_PROGRESS','COMPLETED','NOT_REQUIRED'),false) then raise exception 'Situação do pedido inválida.';end if;
  amount=(payload->>'total')::numeric;
  if amount is not null and (amount<=0 or amount>1000000000 or trunc(amount,2)<>amount) then raise exception 'Informe um valor válido em reais.';end if;
  terms=nullif(payload->'paymentTerms','null'::jsonb);
  if terms is not null and jsonb_typeof(terms)<>'object' then raise exception 'Condição de pagamento inválida.';end if;
  begin delivery=nullif(payload->>'expectedDelivery','')::date; confirmed=nullif(payload->>'confirmedDelivery','')::date;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Data de entrega inválida.';end;
  note=btrim(coalesce(payload->>'notes',''));
  if length(note)>2000 then raise exception 'A observação deve ter até 2.000 caracteres.';end if;
 end if;
 update public.camber_purchase_orders set
  order_total=case when op='edit' then amount else order_total end,
  order_payment_terms=case when op='edit' then terms else order_payment_terms end,
  order_content=case when op='edit' then payload->'content' else order_content end,
  state=case when op='edit' then payload->>'orderState' else state end,
  approved_by=case when op='edit' and po.state<>payload->>'orderState' then case when payload->>'orderState'='APPROVED' then actor end else approved_by end,
  approved_at=case when op='edit' and po.state<>payload->>'orderState' then case when payload->>'orderState'='APPROVED' then now() end else approved_at end,
  confirmed_delivery=case when op='edit' then confirmed else confirmed_delivery end,
  payment_state=case when op='edit' then payload->>'paymentState' else payment_state end,
  delivery_state=case when op='edit' then payload->>'deliveryState' else delivery_state end,
  installation_state=case when op='edit' then payload->>'installationState' else installation_state end,
  received_at=case when op='edit' and payload->>'deliveryState'='DELIVERED' then coalesce(received_at,now()) when op='edit' and po.delivery_state='DELIVERED' then null else received_at end,
  expected_delivery=case when op='edit' then delivery else expected_delivery end,
  order_notes=case when op='edit' then note else order_notes end,
  deleted_at=case when op='trash' then now() when op='restore' then null else deleted_at end,
  edit_version=edit_version+1,last_mutation=mutation where id=po.id;
 insert into public.camber_quote_events(quotation_id,event,actor)
 values(po.quotation_id,'Pedido PC-'||lpad(po.number::text,5,'0')||case op when 'edit' then ' editado' when 'trash' then ' movido para a Lixeira' else ' restaurado' end||
 case when op='edit' and po.state<>payload->>'orderState' then case payload->>'orderState' when 'APPROVED' then ' · Aprovado' when 'REJECTED' then ' · Rejeitado' else ' · Aguardando aprovação' end else '' end,actor);
 return jsonb_build_object('ok',true,'version',po.edit_version+1);
end $$;
revoke all on function public.camber_purchase_change(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.camber_purchase_change(jsonb,uuid) to service_role;
