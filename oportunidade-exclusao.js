(function(){
'use strict';
const Q=window.CamberQuotes;if(!Q)return;
Q.removeOpportunity=async function({projectId,opportunityId}){
 if(document.getElementById('opportunity-delete'))return;
 const d=document.createElement('dialog');d.id='opportunity-delete';d.className='cq-dialog opportunity-delete-dialog';
 d.innerHTML='<h2>Excluir oportunidade</h2><div data-summary><p>Conferindo a oportunidade…</p></div><p class="cq-error" role="alert"></p><div class="cq-actions"><button data-cancel>Cancelar</button><button class="opportunity-delete-confirm" data-confirm disabled>Excluir oportunidade</button></div>';
 document.body.append(d);let busy=false,version='',deleted=false;
 const confirm=d.querySelector('[data-confirm]'),cancel=d.querySelector('[data-cancel]'),error=d.querySelector('[role="alert"]');
 d.onclose=()=>d.remove();d.addEventListener('cancel',e=>{if(busy||deleted)e.preventDefault()});cancel.onclick=()=>{if(!busy&&!deleted)d.close()};d.showModal();cancel.focus();
 try{
  const info=await Q.api('opportunity_delete_preview',{projectId:String(projectId),opportunityId:String(opportunityId)});version=info.version;
  d.querySelector('[data-summary]').innerHTML='<p><strong>'+Q.esc(info.service)+'</strong><br>'+Q.esc(info.projectName)+'</p>'+(info.blocked?'<p>Esta oportunidade tem fornecedor escolhido ou pedido de compra e não pode ser excluída.</p>':'<p>A oportunidade será removida da obra e os totais serão atualizados.</p>'+(info.quotations||info.requests?'<p>'+(info.quotations===1?'A cotação vinculada será cancelada. ':info.quotations>1?'As '+info.quotations+' cotações vinculadas serão canceladas. ':'')+'Os links dos fornecedores serão encerrados. As propostas e os anexos permanecerão no histórico das cotações.</p>':'')+'<p>Deseja excluir esta oportunidade?</p>');
  confirm.hidden=!!info.blocked;confirm.disabled=!!info.blocked;
 }catch(e){error.textContent=e.message;confirm.hidden=true;}
 confirm.onclick=async()=>{
  if(busy||!version)return;busy=true;confirm.disabled=true;cancel.disabled=true;error.textContent='';confirm.textContent=deleted?'Atualizando…':'Excluindo…';
  try{
   if(!deleted){await Q.api('opportunity_delete',{projectId:String(projectId),opportunityId:String(opportunityId),version});deleted=true;}
   await CamberCloud.atualizarOportunidades(projectId);await CamberCloud.atualizarProjetos();
   location.href='projeto.html?id='+encodeURIComponent(projectId)+'&area=oportunidades&excluida=1';
  }catch(e){error.textContent=(deleted?'A oportunidade foi excluída. Falta atualizar esta tela. ':'')+e.message;confirm.textContent=deleted?'Atualizar lista':'Tentar novamente';confirm.disabled=false;cancel.disabled=deleted;busy=false;}
 };
};
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-delete-opportunity]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();
 Q.removeOpportunity({projectId:window.PROJ?.id,opportunityId:b.dataset.deleteOpportunity});
},true);
// The detail panel is rendered by the supplier module; keep this action independent.
function detailAction(){const panel=document.getElementById('supplierPanel'),header=panel?.querySelector('.sp-header');if(!header||header.querySelector('[data-delete-opportunity]'))return;const id=new URLSearchParams(location.search).get('opp');if(!id)return;const b=document.createElement('button');b.type='button';b.className='opportunity-delete-button';b.dataset.deleteOpportunity=id;b.textContent='Excluir oportunidade';header.lastElementChild.append(b);}
new MutationObserver(detailAction).observe(document.getElementById('app'),{childList:true,subtree:true});detailAction();
if(new URLSearchParams(location.search).get('excluida')==='1'){const heading=document.querySelector('.page-h');if(heading){const p=document.createElement('p');p.className='opportunity-deleted-notice';p.setAttribute('role','status');p.textContent='Oportunidade excluída. Os totais da obra foram atualizados.';heading.after(p);}}
})();
