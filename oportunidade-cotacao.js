(function(root){
'use strict';
const same=(a,b)=>String(a??'')===String(b??'');
function shouldAsk(from,to){return to==='prop'&&['prospec','negoc'].includes(from)}
function choices(o){
 const list=Array.isArray(o.proposals)?o.proposals:(!o.forn||o.forn==='a definir'?[]:[{id:'legacy-'+o.id,name:o.forn}]);
 return list.filter(p=>p.id&&p.name).map(p=>({id:String(p.id),name:p.name,supplierId:p.supplierId||null}));
}
function preferred(o,list){return list.find(p=>same(p.id,o.favoriteProposalId))||list.find(p=>p.name===o.forn)||list[0]}
const model={shouldAsk,choices,preferred};
if(typeof module==='object'&&module.exports){module.exports=model;return}
const Q=root.CamberQuotes,E=Q.esc;
Q.proposalTransition=async function({projectId,opportunity,refresh}){
 const list=choices(opportunity),first=preferred(opportunity,list),qid=Q.uuid();
 return new Promise(resolve=>{
  let working=false,finished=false,result=null;
  const d=Q.dialog('<div class="cq-row"><h2>Deseja transformar em cotação?</h2><button class="cq-x" data-close aria-label="Fechar">×</button></div><p><b>'+E(opportunity.serv)+'</b> será movida para <b>Proposta</b>.</p>'+(list.length>1?'<label>Fornecedor da cotação<select data-proposal>'+list.map(p=>'<option value="'+E(p.id)+'"'+(p.id===first.id?' selected':'')+'>'+E(p.name)+(same(p.id,opportunity.favoriteProposalId)?' · Favorita':'')+'</option>').join('')+'</select></label>':list.length?'<p>Fornecedor: <b>'+E(first.name)+'</b></p>':'<p class="cq-error">Adicione um fornecedor à oportunidade para criar a cotação. Você pode escolher Não para apenas mover o cartão.</p>')+'<p class="cq-muted">Sim: cria a cotação deste item no mesmo cliente e projeto, para o fornecedor indicado. Uma cotação aberta existente será aproveitada.</p><p class="cq-muted">O pedido aproveita o escopo da oportunidade e recebe prazo inicial de 14 dias. Revise antes de compartilhar. Nenhum e-mail é enviado.</p><p class="cq-error" data-error role="alert"></p><p data-progress role="status"></p><div class="cq-actions"><button data-no>Não</button><button class="primary" data-yes '+(!list.length?'disabled':'')+'>Sim</button></div>');
  d.setAttribute('aria-label','Transformar oportunidade em cotação');
  const yes=d.querySelector('[data-yes]'),no=d.querySelector('[data-no]'),close=d.querySelector('[data-close]');
  const finish=value=>{if(finished)return;finished=true;resolve(value);d.close()};
  d.addEventListener('close',()=>{if(!finished){finished=true;resolve(true)}});
  d.addEventListener('cancel',e=>{if(working||result)e.preventDefault()});
  no.onclick=()=>{if(!working&&!result)finish(false)};
  yes.onclick=async()=>{
   if(working)return;working=true;yes.disabled=true;no.disabled=true;close.disabled=true;
   const select=d.querySelector('[data-proposal]');if(select)select.disabled=true;
   d.querySelector('[data-error]').textContent='';d.querySelector('[data-progress]').textContent=result?'Atualizando oportunidade…':'Criando cotação…';
   try{
    if(!result)result=await Q.api('proposal_quotation',{projectId:String(projectId),opportunityId:String(opportunity.id),proposalId:select?.value||first.id,expectedStage:opportunity.et,expectedMutation:opportunity.supplierMutation??null,quotationId:qid});
    await refresh();
    await Q.refreshOpportunityQuotes?.();
    const old=document.querySelector('[data-cq-transition-result]');if(old)old.remove();
    const notice=document.createElement('div');notice.dataset.cqTransitionResult='';notice.className='cq-flow-success';notice.setAttribute('role','status');
    notice.innerHTML=(result.reused?'Cotação existente vinculada.':'Cotação criada.')+' Oportunidade em Proposta. <a href="cotacoes.html?id='+encodeURIComponent(result.quotationId)+'">Abrir cotação →</a>';
    document.getElementById('vFunil')?.before(notice);
    finish(true);
   }catch(error){
    d.querySelector('[data-error]').textContent=result?'A cotação já foi salva. Não foi possível atualizar a tela. Clique em Atualizar oportunidade; a cotação não será criada novamente.':error.message;
    d.querySelector('[data-progress]').textContent='';yes.textContent=result?'Atualizar oportunidade':'Sim';
   }finally{working=false;if(!finished){yes.disabled=false;no.disabled=!!result;close.disabled=!!result;if(select)select.disabled=!!result}}
  };
 });
};
Q.shouldOfferQuotation=shouldAsk;
})(typeof window==='object'?window:globalThis);
