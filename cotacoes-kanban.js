(function(root){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count=n=>Math.max(0,Math.floor(Number(n)||0));
function supplier(s){
 const initials=String(s.name||'?').trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('');
 const label=s.responded?'Respondeu':s.awaiting?'Aguardando':({SELECTED:'Selecionado',NOT_SELECTED:'Não selecionado',EXPIRED:'Prazo encerrado'}[s.status]||'Participante');
 return '<li><span class="cq-participant-avatar" aria-hidden="true">'+esc(initials)+'</span><span class="cq-participant-name">'+esc(s.name)+'</span><span class="cq-participant-state '+(s.responded?'received':'')+'">'+esc(label)+'</span></li>';
}
function summaryHTML(list){return list.map(q=>{
 const suppliers=q.suppliers||[],invited=count(q.invited),received=count(q.received),awaiting=count(q.awaiting);
 return '<section class="cq-opp-summary cq-kanban-quote" aria-label="'+esc(q.code)+'"><a href="cotacoes.html?id='+encodeURIComponent(q.id)+'" onclick="event.stopPropagation()"><b>'+esc(q.code)+'</b> · Abrir cotação →</a><div class="cq-response-count"><strong>'+received+' de '+invited+' responderam</strong><span>'+awaiting+' aguardando</span></div><progress value="'+Math.min(received,invited)+'" max="'+Math.max(invited,1)+'" aria-label="'+received+' de '+invited+' propostas recebidas"></progress><ul class="cq-participants">'+suppliers.slice(0,3).map(supplier).join('')+'</ul>'+(suppliers.length>3?'<details data-cq-participants><summary>Ver mais '+(suppliers.length-3)+' participantes</summary><ul class="cq-participants">'+suppliers.slice(3).map(supplier).join('')+'</ul></details>':'')+'</section>';
 }).join('');}
if(typeof module==='object'&&module.exports)module.exports={summaryHTML};else root.CamberQuotes.opportunitySummaryHTML=summaryHTML;
})(typeof window==='object'?window:globalThis);
