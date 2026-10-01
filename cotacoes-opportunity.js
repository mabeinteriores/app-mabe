(async function(){
'use strict';if(!window.PROJ||!window.CamberQuotes)return;const Q=CamberQuotes,M=CamberQuoteModel,E=Q.esc;let quotes=[],active='overview';
const currentQuotes=()=>M.forOpportunity(quotes,PROJ.id,new URLSearchParams(location.search).get('opp'));
function markup(list){return Q.opportunitySummaryHTML(list)}
async function comparisonDialog(){
 const list=currentQuotes();if(!list.length){window.openOpportunityComparison?.();return;}
 const d=Q.dialog('<div class="cq-row"><h2>Comparar propostas</h2><button data-close class="cq-x" aria-label="Fechar comparativo">×</button></div><div class="cq-office" data-comparison-content><p role="status">Carregando comparativo…</p></div>');
 d.style.width='min(1180px,94vw)';d.setAttribute('aria-label','Comparar propostas');
 const el=d.querySelector('[data-comparison-content]');
 try{
  const details=await Promise.all(list.map(q=>Q.api('detail',{quotationId:q.id})));if(!d.isConnected)return;
  el.innerHTML=details.map(detail=>'<section class="cq-panel" data-quote="'+E(detail.quotation.id)+'"><div class="cq-row"><h3>'+E(detail.quotation.code)+'</h3><a href="cotacoes.html?id='+encodeURIComponent(detail.quotation.id)+'&tab=compare">Abrir cotação →</a></div>'+Q.comparisonHTML(detail)+'</section>').join('');
  el.onclick=e=>{const b=e.target.closest('[data-request]');if(!b)return;const detail=details.find(x=>x.quotation.id===b.closest('[data-quote]')?.dataset.quote),request=detail?.requests.find(r=>r.id===b.dataset.request);if(b.dataset.do==='response'&&request)Q.details(request.response,request.supplier_name);else if(detail)location.href='cotacoes.html?id='+encodeURIComponent(detail.quotation.id)+'&tab=compare';};
 }catch(error){if(d.isConnected)el.textContent='Não foi possível abrir o comparativo. '+error.message;}
}
function view(panel){
 panel.querySelectorAll('.sp-stats,.sp-bar,.sp-cards,.sp-panel,[data-cq-summary],[data-cq-extra]').forEach(el=>{
  const type=el.matches('.sp-stats,[data-cq-summary]')?'overview':el.matches('.sp-bar,.sp-cards')?'suppliers':el.querySelector('.sp-history')?'history':el.hasAttribute('data-cq-extra')?'extra':'overview';
  el.hidden=type==='extra'?!['items','documents','history'].includes(active):type!==active;
 });
 panel.querySelectorAll('[data-cq-tab]').forEach(b=>b.classList.toggle('active',b.dataset.cqTab===active));
}
let extraRequest=0;
async function extra(panel){
 const el=panel.querySelector('[data-cq-extra]'),requestedTab=active,request=++extraRequest;el.textContent='Carregando…';
 try{
  const ds=await Promise.all(currentQuotes().map(q=>Q.api('detail',{quotationId:q.id})));
  if(request!==extraRequest||active!==requestedTab||!el.isConnected)return;
  if(requestedTab==='items')el.innerHTML=ds.map(d=>'<h3>'+E(d.quotation.code)+'</h3>'+d.quotation.specification.items.map(i=>'<p>'+E(i.room+' — '+i.title)+' · '+E(i.quantity+' '+i.unit)+'</p>').join('')).join('')||'<p>Crie uma cotação para definir os itens.</p>';
  if(requestedTab==='history')el.innerHTML=ds.map(d=>'<h3>'+E(d.quotation.code)+'</h3>'+d.events.map(e=>'<p>'+E(e.event)+'<small>'+E(e.supplier||e.actor||'')+' · '+new Date(e.at).toLocaleString('pt-BR')+'</small></p>').join('')).join('');
  if(requestedTab==='documents'){
   el.innerHTML=ds.map(d=>'<h3>'+E(d.quotation.code)+'</h3>'+d.requests.map(r=>'<button data-docs="'+E(r.id)+'">'+E(r.supplier_name)+' · Documentos</button>').join(' ')).join('')||'<p>Nenhuma cotação.</p>';
   el.querySelectorAll('[data-docs]').forEach(b=>b.onclick=async()=>{try{const data=await Q.api('files',{id:b.dataset.docs});Q.dialog('<h2>Documentos</h2>'+data.files.map(f=>'<p><a target="_blank" rel="noopener" href="'+E(f.url)+'">'+E(f.name)+'</a></p>').join('')+(data.files.length?'':'<p>Nenhum documento.</p>')+'<button data-close>Fechar</button>')}catch(e){alert(e.message)}});
  }
 }catch(e){if(request===extraRequest&&active===requestedTab&&el.isConnected)el.textContent=e.message;}
}
function paint(){
const createdId=new URLSearchParams(location.search).get('cotacao_criada'),created=quotes.find(q=>q.id===createdId&&String(q.project_id)===String(PROJ.id));
if(created&&!document.querySelector('[data-cq-created]')){const toolbar=document.getElementById('oppCount')?.closest('.toolbar');if(toolbar){const notice=document.createElement('div');notice.dataset.cqCreated='';notice.className='cq-flow-success';notice.setAttribute('role','status');notice.innerHTML='Oportunidade e cotação criadas. '+E(created.invited)+' fornecedores participantes. <a href="cotacoes.html?id='+encodeURIComponent(created.id)+'">Abrir '+E(created.code)+' · Enviar cotação →</a>';toolbar.after(notice);}}
document.querySelectorAll('.opp[data-id]').forEach(card=>{const list=M.forOpportunity(quotes,PROJ.id,card.dataset.id);let el=card.querySelector('[data-cq-summary]');if(!el){el=document.createElement('div');el.dataset.cqSummary='';card.append(el)}card.classList.toggle('has-quote-response',list.some(q=>q.received>0));const html=markup(list);if(el.dataset.cqMarkup!==html){el.dataset.cqMarkup=html;el.innerHTML=html;}const old=card.querySelectorAll('.of')[1];if(old)old.hidden=!!list.length;});const panel=document.getElementById('supplierPanel');if(!panel)return;
let el=panel.querySelector('[data-cq-summary]');if(!el){el=document.createElement('section');el.className='cq-panel';el.dataset.cqSummary='';panel.querySelector('.sp-header')?.after(el)}const oid=new URLSearchParams(location.search).get('opp'),list=currentQuotes();const html='<div class="cq-row"><h2>Cotações desta oportunidade</h2><button data-new-cq>+ Nova cotação</button></div>'+list.filter(M.open).map(q=>'<a class="btn" href="cotacoes.html?id='+encodeURIComponent(q.id)+'&send=1">Enviar cotação · '+E(q.code)+'</a>').join(' ')+(markup(list)||'<p>Nenhuma cotação criada para esta oportunidade.</p>');if(el.dataset.cqMarkup!==html){el.dataset.cqMarkup=html;el.innerHTML=html;el.querySelector('[data-new-cq]').onclick=()=>Q.wizard({projectId:PROJ.id,opportunityId:oid}).catch(e=>alert(e.message))}
if(!panel.querySelector('[data-cq-tabs]')){const nav=document.createElement('nav');nav.dataset.cqTabs='';nav.className='cq-actions cq-tabs';nav.innerHTML=[['overview','Visão geral'],['compare','Comparativo'],['suppliers','Fornecedores'],['items','Itens'],['documents','Documentos'],['history','Histórico']].map(([k,l])=>'<button data-cq-tab="'+k+'">'+l+'</button>').join('');panel.querySelector('.sp-header')?.after(nav);const aux=document.createElement('section');aux.dataset.cqExtra='';aux.className='cq-panel';panel.append(aux);nav.onclick=e=>{const b=e.target.closest('[data-cq-tab]');if(!b)return;if(b.dataset.cqTab==='compare'){comparisonDialog();return;}active=b.dataset.cqTab;view(panel);if(['items','documents','history'].includes(active))extra(panel)};}
view(panel);
}
document.addEventListener('click',e=>{if(e.target.closest('[data-cq-participants]')){e.stopPropagation();return;}if(e.target.closest('#supplierPanel [data-action="compare"]')){e.preventDefault();e.stopImmediatePropagation();panelCompare();return;}const b=e.target.closest('#supplierPanel [data-action="add"]');if(!b)return;const q=currentQuotes().find(M.open);if(q){e.preventDefault();e.stopImmediatePropagation();location.href='cotacoes.html?id='+q.id+'&tab=suppliers&add=1'}},true);
function panelCompare(){comparisonDialog();}
try{await Q.ready();quotes=await Q.api('dashboard');paint();const target=document.querySelector('#app .wrap');let scheduled=false;new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;paint()})}).observe(target,{childList:true,subtree:true});setInterval(async()=>{if(document.hidden||document.querySelector('dialog[open]'))return;try{quotes=await Q.api('dashboard');paint()}catch{}},60000)}catch(e){console.info('Cotações:',e.message)}
})();
