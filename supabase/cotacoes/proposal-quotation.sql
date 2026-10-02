-- Convert a Kanban transition and create/reuse its supplier quotation atomically.
-- Called only by the authenticated Edge route, never directly by browsers.
create or replace function public.camber_proposal_quotation(payload jsonb,actor uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare pid text=payload->>'projectId';oid text=payload->>'opportunityId';requested uuid=(payload->>'quotationId')::uuid;
 k jsonb;o jsonb;p jsonb;f jsonb;ps jsonb;spec jsonb;oi int;pi int;matches int;sid text;
 q public.camber_quotations%rowtype;reused boolean=false;was text;who text;legacy boolean=false;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and ativo and aprovado and (papel='admin' or 'projetos'=any(abas_permitidas))) then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if coalesce(payload->>'expectedStage','') not in ('prospec','negoc') or requested is null then raise exception 'Movimentação inválida.';end if;
 perform pg_advisory_xact_lock(hashtextextended('camber-quotes-'||pid,0));
 select value into k from public.kv_store where workspace='mabe' and key='mabe-opps-v3-'||pid for update;
 select x,(ord-1)::int into o,oi from jsonb_array_elements(k) with ordinality t(x,ord) where x->>'id'=oid;
 if o is null then raise exception 'Oportunidade não encontrada.';end if;
 if coalesce(o->>'selectedProposalId','')<>'' or o->>'et'='win' then raise exception 'Reabra a comparação antes de criar uma cotação.';end if;
 was=o->>'et';ps=case when jsonb_typeof(o->'proposals')='array' then o->'proposals' else '[]'::jsonb end;
 if jsonb_typeof(o->'proposals') is distinct from 'array' and coalesce(trim(o->>'forn'),'') not in ('','a definir') then
  legacy=true;ps=jsonb_build_array(jsonb_build_object('id','legacy-'||oid,'name',o->>'forn','value',coalesce(o->'val','0'),'rt',coalesce(o->'rt','0'),'rtTipo',coalesce(o->>'rtTipo','pct'),'scope',coalesce(o->>'obs',''),'status','Aguardando proposta'));
 end if;
 select x,(ord-1)::int into p,pi from jsonb_array_elements(ps) with ordinality t(x,ord) where x->>'id'=payload->>'proposalId';
 if p is null then raise exception 'Adicione um fornecedor à oportunidade antes de criar a cotação.';end if;
 sid=nullif(p->>'supplierId','');
 if sid is null then
  select count(*),min(x->>'id') into matches,sid from public.kv_store s,jsonb_array_elements(case when jsonb_typeof(s.value)='array' then s.value else '[]'::jsonb end) x
   where s.workspace='mabe' and s.key='mabe-fornecedores-v1' and lower(trim(x->>'nome'))=lower(trim(p->>'name'));
  if matches<>1 then raise exception 'Vincule este fornecedor ao cadastro na oportunidade antes de criar a cotação.';end if;
 end if;
 select x into f from public.kv_store s,jsonb_array_elements(case when jsonb_typeof(s.value)='array' then s.value else '[]'::jsonb end) x where s.workspace='mabe' and s.key='mabe-fornecedores-v1' and x->>'id'=sid;
 if f is null or f->>'ativo'='false' or lower(f->>'status')='inativo' then raise exception 'Selecione um fornecedor ativo cadastrado.';end if;
 if not exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(f->'categorias')='array' and jsonb_array_length(f->'categorias')>0 then f->'categorias' else jsonb_build_array(f->>'categoria') end) t(v) where translate(lower(trim(v)),'áàãâéêíóôõúç','aaaaeeiooouc')=translate(lower(trim(o->>'serv')),'áàãâéêíóôõúç','aaaaeeiooouc')) then raise exception 'Fornecedor sem o serviço desta oportunidade.';end if;
 select * into q from public.camber_quotations where id=requested;
 if q.id is not null and (q.project_id<>pid or q.opportunity_id<>oid or not exists(select 1 from public.camber_quote_requests where quotation_id=q.id and supplier_id=sid)) then raise exception 'Identificador já utilizado.';end if;
 if q.id is null then
  select qq.* into q from public.camber_quotations qq join public.camber_quote_requests rr on rr.quotation_id=qq.id
   where qq.project_id=pid and qq.opportunity_id=oid and qq.state='OPEN' and qq.workflow<>'CANCELED' and qq.expires_at>now()
    and rr.supplier_id=sid and rr.active and rr.status not in ('DECLINED','DISQUALIFIED','NOT_SELECTED')
   order by qq.created_at desc limit 1;
 end if;
 -- A second click/client arriving after the first can return the same saved result.
 if was='prop' and q.id is not null then return jsonb_build_object('quotationId',q.id,'reused',true);end if;
 if was is distinct from payload->>'expectedStage' or coalesce(o->'supplierMutation','null'::jsonb) is distinct from coalesce(payload->'expectedMutation','null'::jsonb) then raise exception 'A oportunidade foi alterada. Atualize a página antes de mover novamente.';end if;
 reused=q.id is not null;
 p=p||jsonb_build_object('supplierId',sid,'name',f->>'nome');ps=jsonb_set(ps,array[pi::text],p);o=o||jsonb_build_object('proposals',ps);
 if legacy or coalesce(o->>'favoriteProposalId','')='' then o=o||jsonb_build_object('favoriteProposalId',p->>'id');end if;
 update public.kv_store set value=jsonb_set(k,array[oi::text],o),updated_at=clock_timestamp(),updated_by=actor where workspace='mabe' and key='mabe-opps-v3-'||pid;
 if not reused then
  spec=jsonb_build_object('mode','custom','title',left(coalesce(nullif(trim(o->>'titulo'),''),o->>'serv'),150),'description',left(coalesce(nullif(trim(p->>'scope'),''),nullif(trim(o->>'obs'),''),'Orçar '||(o->>'serv')||' conforme a oportunidade.'),3000),
   'items',jsonb_build_array(jsonb_build_object('id','opportunity-'||oid,'room','','title',left(o->>'serv',200),'quantity',1,'unit','un')));
  perform public.camber_quotes_api('new_quotation',jsonb_build_object('quotationId',requested,'projectId',pid,'opportunityId',oid,'supplierIds',jsonb_build_array(sid),'specification',spec,
   'expiresAt',((current_timestamp at time zone 'America/Sao_Paulo')::date+14+time '23:59:59') at time zone 'America/Sao_Paulo','estimatedValue',greatest(0,least(1e9,coalesce((p->>'value')::numeric,(o->>'val')::numeric,0)))),actor);
  select * into q from public.camber_quotations where id=requested;
  update public.camber_quotations set workflow='AWAITING_SEND' where id=q.id;
 end if;
 -- The quotation routines can enrich the opportunity; reload before setting its stage.
 select value into k from public.kv_store where workspace='mabe' and key='mabe-opps-v3-'||pid;
 o=k->oi;select nome into who from public.profiles where id=actor;
 o=o||jsonb_build_object('et','prop','quotationId',q.id,'supplierMutation',gen_random_uuid(),'proposalHistory',coalesce(o->'proposalHistory','[]'::jsonb)||jsonb_build_array(jsonb_build_object('at',now(),'user',who,'text','Movida para Proposta; cotação '||case when reused then 'existente vinculada' else 'criada' end||' para '||(f->>'nome')||'.')));
 update public.kv_store set value=jsonb_set(k,array[oi::text],o),updated_at=clock_timestamp(),updated_by=actor where workspace='mabe' and key='mabe-opps-v3-'||pid;
 insert into public.camber_quote_events(quotation_id,event,actor) values(q.id,'Oportunidade movida para Proposta: '||case when reused then 'cotação existente vinculada' else 'cotação criada pelo Kanban' end,actor);
 return jsonb_build_object('quotationId',q.id,'reused',reused);
end $$;
revoke all on function public.camber_proposal_quotation(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.camber_proposal_quotation(jsonb,uuid) to service_role;
