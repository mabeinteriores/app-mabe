(function(root){
'use strict';
const labels={DRAFT:'Rascunho',AWAITING_SEND:'Aguardando compartilhamento',IN_QUOTATION:'Em cotação',AWAITING_SUPPLIERS:'Aguardando fornecedores',PARTIAL:'Parcialmente respondida',READY:'Pronta para comparar',NEGOTIATION:'Em negociação',CLOSED:'Encerrada',EXPIRED:'Vencida',CANCELED:'Cancelada',INVITED:'Convidado',VIEWED:'Visualizou',IN_PROGRESS:'Preenchendo',SUBMITTED:'Proposta recebida',DECLINED:'Não participará',DISQUALIFIED:'Desclassificado',SELECTED:'Selecionado',NOT_SELECTED:'Não selecionado'};
const day=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d));
Object.assign(labels,{PAUSED:'Pausada',ARCHIVED:'Arquivada',TRASH:'Na lixeira'});
const open=q=>q.state==='OPEN'&&!['PAUSED','CANCELED','ARCHIVED','TRASH'].includes(q.status);
const quick=(q,key,now=new Date())=>key==='all'&&!['ARCHIVED','TRASH'].includes(q.status)||key==='paused'&&q.status==='PAUSED'||key==='canceled'&&q.status==='CANCELED'||key==='archived'&&q.status==='ARCHIVED'||key==='trash'&&q.status==='TRASH'||key==='awaiting'&&open(q)&&q.awaiting>0||key==='ready'&&q.status==='READY'||key==='due'&&open(q)&&q.awaiting>0&&day(q.expires_at)===day(now)||key==='late'&&open(q)&&q.awaiting>0&&Date.parse(q.expires_at)<=+now||key==='closed'&&q.status==='CLOSED'||key==='unviewed'&&open(q)&&q.unviewed>0;
function controlActions(q){
 const s=q.workflow||q.status;
 if(s==='ARCHIVED'||s==='TRASH')return ['RESTORE'];
 if(q.selected_request_id)return ['ARCHIVED'];
 if(s==='PAUSED')return ['RESUME','CANCELED'];
 if(s==='CANCELED')return ['RESUME','ARCHIVED'];
 if(s==='DRAFT')return [...(q.state==='CLOSED'?['RESUME']:[]),'CANCELED',...(Number(q.received||0)===0?['TRASH']:[])];
 if(q.state==='CLOSED')return ['RESUME','ARCHIVED'];
 return ['PAUSED','CANCELED'];
}
function notice(q,now=new Date()){
 if(!open(q))return null;
 if(quick(q,'late',now))return {tone:'late',text:'Prazo vencido'};
 if(quick(q,'due',now))return {tone:'due',text:'Prazo vence hoje'};
 if(q.received>0&&(!q.reviewed_at||Date.parse(q.last_response)>Date.parse(q.reviewed_at)))return {tone:'new',text:'Nova proposta recebida'};
 if(q.status==='READY')return {tone:'ready',text:'Pronta para comparar'};
 if(q.unviewed>0)return {tone:'pending',text:'Fornecedor ainda não visualizou'};
 return null;
}
function kpis(rows,now=new Date()){return {open:rows.filter(open).length,awaiting:rows.filter(q=>quick(q,'awaiting',now)).length,ready:rows.filter(q=>quick(q,'ready',now)).length,due:rows.filter(q=>quick(q,'due',now)).length,late:rows.filter(q=>quick(q,'late',now)).length,value:rows.filter(open).reduce((a,q)=>a+Number(q.estimated_value),0),attention:rows.filter(q=>q.attention).length,unviewed:rows.filter(open).reduce((a,q)=>a+q.unviewed,0)};}
function forOpportunity(rows,pid,oid){return rows.filter(q=>String(q.project_id)===String(pid)&&String(q.opportunity_id)===String(oid));}
const counts=q=>`${q.invited} convidados · ${q.received} propostas recebidas · ${q.awaiting} aguardando`;
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
function eligible(f,service){return f.ativo!==false&&norm(f.status)!=='inativo'&&(Array.isArray(f.categorias)&&f.categorias.length?f.categorias:[f.categoria]).some(c=>norm(c)===norm(service));}
function delta(first,last){return {amount:last-first,percent:first>0?(last-first)/first*100:null};}
function currentResponse(r){return r.active!==false&&!!r.response&&Number(r.response.version||1)===Number(r.revision||1)&&!['DISQUALIFIED','DECLINED','DRAFT','EXPIRED'].includes(r.status);}
function savings(value,reference){
 if(value===null||value===undefined||value===''||reference===null||reference===undefined||reference==='')return null;
 value=Number(value);reference=Number(reference);
 if(!Number.isFinite(value)||!Number.isFinite(reference)||value<0||reference<value)return null;
 const amount=Math.round((reference-value)*100)/100;
 return {amount,percent:reference>0?amount/reference*100:null};
}
const model={labels,day,open,quick,kpis,notice,forOpportunity,counts,norm,eligible,delta,currentResponse,savings,controlActions};root.CamberQuoteModel=model;if(typeof module==='object')module.exports=model;
})(typeof window==='object'?window:globalThis);
