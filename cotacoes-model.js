(function(root){
'use strict';
const labels={DRAFT:'Rascunho',AWAITING_SEND:'Aguardando compartilhamento',IN_QUOTATION:'Em cotação',AWAITING_SUPPLIERS:'Aguardando fornecedores',PARTIAL:'Parcialmente respondida',READY:'Pronta para comparar',NEGOTIATION:'Em negociação',CLOSED:'Encerrada',EXPIRED:'Vencida',CANCELED:'Cancelada',INVITED:'Convidado',VIEWED:'Visualizou',IN_PROGRESS:'Preenchendo',SUBMITTED:'Proposta recebida',DECLINED:'Não participará',DISQUALIFIED:'Desclassificado',SELECTED:'Selecionado',NOT_SELECTED:'Não selecionado'};
const day=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d));
const open=q=>q.state==='OPEN'&&q.status!=='CANCELED';
const quick=(q,key,now=new Date())=>key==='all'||key==='awaiting'&&open(q)&&q.awaiting>0||key==='ready'&&q.status==='READY'||key==='due'&&open(q)&&day(q.expires_at)===day(now)||key==='late'&&open(q)&&Date.parse(q.expires_at)<+now||key==='closed'&&q.state==='CLOSED'||key==='unviewed'&&open(q)&&q.unviewed>0;
function kpis(rows,now=new Date()){return {open:rows.filter(open).length,awaiting:rows.filter(q=>quick(q,'awaiting',now)).length,ready:rows.filter(q=>quick(q,'ready',now)).length,due:rows.filter(q=>quick(q,'due',now)).length,late:rows.filter(q=>quick(q,'late',now)).length,value:rows.filter(open).reduce((a,q)=>a+Number(q.estimated_value),0),attention:rows.filter(q=>q.attention).length,unviewed:rows.filter(open).reduce((a,q)=>a+q.unviewed,0)};}
function forOpportunity(rows,pid,oid){return rows.filter(q=>String(q.project_id)===String(pid)&&String(q.opportunity_id)===String(oid));}
const counts=q=>`${q.invited} convidados · ${q.received} propostas recebidas · ${q.awaiting} aguardando`;
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
function eligible(f,service){return f.ativo!==false&&norm(f.status)!=='inativo'&&(Array.isArray(f.categorias)&&f.categorias.length?f.categorias:[f.categoria]).some(c=>norm(c)===norm(service));}
function delta(first,last){return {amount:last-first,percent:first>0?(last-first)/first*100:null};}
const model={labels,day,open,quick,kpis,forOpportunity,counts,norm,eligible,delta};root.CamberQuoteModel=model;if(typeof module==='object')module.exports=model;
})(typeof window==='object'?window:globalThis);
