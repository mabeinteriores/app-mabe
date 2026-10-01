-- Internal remuneration is stored on the proposal, separate from supplier responses.
create or replace function public.camber_remuneration_values(p jsonb, response jsonb default null)
returns jsonb language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare m jsonb:=p->'remuneration';r jsonb:=coalesce(response,p->'quoteResponse','{}');cost numeric;basis numeric;rt numeric;markup numeric;received numeric;mode text;
begin
cost=coalesce((r->>'total')::numeric,(p->>'value')::numeric,0);mode=coalesce(m->>'mode','rt');
basis=case coalesce(m->>'rtBase','total') when 'custom' then coalesce((m->>'customBase')::numeric,0) when 'products' then greatest(0,(r->>'subtotal')::numeric-coalesce((r->>'discount')::numeric,0)) else cost end;
if coalesce(m->>'rtBase','total')='products' and r->>'subtotal' is null then basis=null;end if;
rt=case when mode='markup' then 0 when coalesce(m->>'rtType',p->>'rtTipo','pct')='brl' then coalesce((m->>'rt')::numeric,(p->>'rt')::numeric,0) else round(basis*coalesce((m->>'rt')::numeric,(p->>'rt')::numeric,0)/100,2) end;
markup=case when mode='rt' then 0 when m->>'markupType'='pct' then round(cost*coalesce((m->>'markup')::numeric,0)/100,2) else coalesce((m->>'markup')::numeric,0) end;
received=coalesce((m->>'rtReceived')::numeric,0)+coalesce((m->>'markupReceived')::numeric,0);
return jsonb_build_object('cost',cost,'base',basis,'rt',rt,'markup',markup,'client',cost+markup,'earned',rt+markup,'received',received,'pending',rt+markup-received,'supplierNet',cost-rt);
end $$;
revoke all on function public.camber_remuneration_values(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.camber_remuneration_values(jsonb,jsonb) to service_role;

create or replace function public.camber_proposal_remuneration(action text,payload jsonb,actor uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare pid text:=payload->>'projectId';oid text:=payload->>'opportunityId';propid text:=payload->>'proposalId';k jsonb;o jsonb;p jsonb;m jsonb;oi int;pi int;field text;n numeric;calc jsonb;mutation uuid;reference_id text;
begin
if actor is null or not exists(select 1 from public.profiles where id=actor and ativo and aprovado and papel='admin') then raise exception 'Acesso não autorizado à remuneração.' using errcode='42501';end if;
if action not in ('remuneration_read','remuneration_save') then raise exception 'Ação inválida.';end if;
perform pg_advisory_xact_lock(hashtextextended('camber-quotes-'||pid,0));
select value into k from public.kv_store where workspace='mabe' and key='mabe-opps-v3-'||pid for update;
select x,(ord-1)::int into o,oi from jsonb_array_elements(k) with ordinality a(x,ord) where x->>'id'=oid;
if jsonb_typeof(o->'proposals') is distinct from 'array' and coalesce(o->>'forn','') not in ('','a definir') then
 o=o||jsonb_build_object('proposals',jsonb_build_array(jsonb_build_object('id','legacy-'||oid,'name',o->>'forn','value',coalesce(o->'val','0'),'rt',coalesce(o->'rt','0'),'rtTipo',coalesce(o->>'rtTipo','pct'))),'favoriteProposalId','legacy-'||oid);
 if o->>'et'='win' then o=o||jsonb_build_object('selectedProposalId','legacy-'||oid);end if;
end if;
select x,(ord-1)::int into p,pi from jsonb_array_elements(coalesce(o->'proposals','[]')) with ordinality a(x,ord) where x->>'id'=propid;
if p is null then raise exception 'Proposta não encontrada. Atualize a oportunidade.';end if;
if action='remuneration_read' then return jsonb_build_object('proposal',p,'mutation',o->'supplierMutation');end if;
if (payload->'expectedMutation') is distinct from coalesce(o->'supplierMutation','null'::jsonb) then raise exception 'A proposta mudou. Reabra a remuneração antes de salvar.';end if;
m=payload->'remuneration';
if jsonb_typeof(m)<>'object' or coalesce(m->>'mode','') not in ('rt','markup','both') or coalesce(m->>'rtType','') not in ('pct','brl') or coalesce(m->>'markupType','') not in ('pct','brl') or coalesce(m->>'rtBase','') not in ('total','products','custom') or coalesce(m->>'payer','') not in ('supplier','office','split') then raise exception 'Confira a forma de remuneração.';end if;
foreach field in array array['rt','markup','customBase','rtReceived','markupReceived'] loop
 if jsonb_typeof(m->field) is distinct from 'number' then raise exception 'Confira os valores da remuneração.';end if;
 n=(m->>field)::numeric;if n<0 or n>1000000000 then raise exception 'Valor inválido.';end if;
 m=jsonb_set(m,array[field],to_jsonb(round(n,2)));
end loop;
if m->>'rtType'='pct' and (m->>'rt')::numeric>100 then raise exception 'RT percentual deve ficar entre 0 e 100%%.';end if;
foreach field in array array['rt','markup'] loop
 if coalesce(m->>(field||'Date'),'')<>'' then
  if m->>(field||'Date')!~'^\d{4}-\d{2}-\d{2}$' or to_char((m->>(field||'Date'))::date,'YYYY-MM-DD')<>m->>(field||'Date') then raise exception 'Data inválida.';end if;
 elsif (m->>(field||'Received'))::numeric>0 then raise exception 'Informe a data do recebimento.';end if;
end loop;
-- Keep only known internal fields, so arbitrary payload data cannot alter supplier terms.
select jsonb_object_agg(key,value) into m from jsonb_each(m) where key=any(array['mode','rt','rtType','rtBase','customBase','markup','markupType','payer','rtReceived','rtDate','markupReceived','markupDate']);
p=p||jsonb_build_object('remuneration',m);calc=public.camber_remuneration_values(p);
if calc->>'rt' is null then raise exception 'Produtos não detalhados. Informe a base negociada ou use o total.';end if;
if (calc->>'client')::numeric>1000000000 then raise exception 'Preço ao cliente supera o limite permitido.';end if;
if (calc->>'rt')::numeric>(calc->>'cost')::numeric then raise exception 'RT não pode superar o valor do fornecedor.';end if;
mutation=gen_random_uuid();
o=jsonb_set(o,array['proposals',pi::text],p)||jsonb_build_object('supplierMutation',mutation,'proposalHistory',coalesce(o->'proposalHistory','[]')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'at',now(),'user',(select nome from public.profiles where id=actor),'text','Remuneração atualizada: '||(p->>'name'),'remuneration',m)));
reference_id=coalesce(o->>'selectedProposalId',o->>'favoriteProposalId');
if reference_id=propid then o=o||jsonb_build_object('rt',(calc->>'earned')::numeric,'rtTipo','brl');end if;
update public.kv_store set value=jsonb_set(k,array[oi::text],o),updated_at=clock_timestamp(),updated_by=actor where workspace='mabe' and key='mabe-opps-v3-'||pid;
insert into public.camber_quote_events(quotation_id,request_id,event,actor) select r.quotation_id,r.id,'Remuneração interna atualizada',actor from public.camber_quote_requests r where r.project_id=pid and r.opportunity_id=oid and r.proposal_id=propid;
return jsonb_build_object('ok',true,'mutation',mutation);
end $$;
revoke all on function public.camber_proposal_remuneration(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.camber_proposal_remuneration(text,jsonb,uuid) to service_role;

-- Extend only the office detail projection; public supplier lookup stays unchanged.
do $$ declare definition text;begin
select pg_get_functiondef('public.camber_quotes_api(text,jsonb,uuid)'::regprocedure) into definition;
if position('''remuneration'',pp->''remuneration''' in definition)=0 then
definition=replace(definition,'''rtTipo'',pp->''rtTipo''','''rtTipo'',pp->''rtTipo'',''value'',pp->''value'',''quoteResponse'',pp->''quoteResponse'',''remuneration'',pp->''remuneration''');
end if;
if position('''clientPrices''' in definition)=0 then
definition=replace(definition,'''financial'',case','''clientPrices'',coalesce((select jsonb_agg(jsonb_build_object(''proposalId'',pp->>''id'',''value'',public.camber_remuneration_values(pp)->''client'')) from public.kv_store ss,jsonb_array_elements(case when jsonb_typeof(ss.value)=''array'' then ss.value else ''[]''::jsonb end) oo,jsonb_array_elements(coalesce(oo->''proposals'',''[]'')) pp where ss.workspace=''mabe'' and ss.key=''mabe-opps-v3-''||q.project_id and oo->>''id''=q.opportunity_id),''[]''),''financial'',case');
end if;
execute definition;
end $$;
