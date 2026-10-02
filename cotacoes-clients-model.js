(function(root){
'use strict';
const M=typeof module==='object'?require('./cotacoes-model.js'):root.CamberQuoteModel;
const nameKey=x=>String(x||'').trim().toLowerCase();
function identity(project,clients){
 const id=String(project.clienteId||''),name=String(project.cliente||'').trim();
 const matches=clients.filter(c=>id?String(c.id)===id:name&&nameKey(c.nome)===nameKey(name));
 const client=matches.length===1?matches[0]:null;
 return {client_key:id?'client:'+id:client?'client:'+client.id:!name||matches.length>1?'project:'+project.id:'name:'+nameKey(name),client_name:client?.nome||name||'Cliente não informado'};
}
function build(projects,clients,rows,now=new Date()){
 const byProject=new Map(),groups=new Map();
 function add(project){const c=identity(project,clients);byProject.set(String(project.id),c);if(!groups.has(c.client_key))groups.set(c.client_key,{...c,projects:[],total:0,open:0,awaiting:0,ready:0,late:0,value:0});const g=groups.get(c.client_key);if(!g.projects.some(p=>p.id===String(project.id)))g.projects.push({id:String(project.id),name:project.nome||'Projeto indisponível'});}
 projects.forEach(add);
 const quotes=rows.map(q=>{
  if(!byProject.has(String(q.project_id)))add({id:q.project_id,nome:q.project_name});
  const c=byProject.get(String(q.project_id)),g=groups.get(c.client_key);g.total++;
  if(M.open(q)){g.open++;g.value+=Number(q.estimated_value)||0;if(q.awaiting>0)g.awaiting++;if(q.status==='READY')g.ready++;if(M.quick(q,'late',now))g.late++;}
  return {...q,...c};
 });
 return {clients:[...groups.values()],quotes};
}
function paginate(rows,page=1,size=25){size=Math.max(1,Math.min(100,Number(size)||25));page=Math.max(1,Math.min(Number(page)||1,Math.max(1,Math.ceil(rows.length/size))));return {rows:rows.slice((page-1)*size,page*size),total:rows.length,page,pageSize:size};}
function clientsPage(snapshot,p={}){
 let all=snapshot.clients.filter(c=>(!p.clientKey||c.client_key===p.clientKey)&&(p.scope!=='open'||c.open>0)&&(!p.search||M.norm([c.client_name,...c.projects.map(x=>x.name)].join(' ')).includes(M.norm(p.search))));
 all.sort((a,b)=>Number(b.late>0)-Number(a.late>0)||Number(b.open>0)-Number(a.open>0)||a.client_name.localeCompare(b.client_name,'pt-BR')||a.client_key.localeCompare(b.client_key));
 const result=paginate(all,p.page,p.pageSize);return {...result,clients:result.rows,totals:{clients:snapshot.clients.length,open:snapshot.clients.reduce((n,c)=>n+c.open,0),late:snapshot.clients.reduce((n,c)=>n+c.late,0)}};
}
function quotesPage(snapshot,clientKey,p={},now=new Date()){
 const base=snapshot.quotes.filter(q=>q.client_key===clientKey),f=p.filters||{},facets={};
 for(const key of ['project_name','client_name','service','responsible','status'])facets[key]=[...new Set(base.map(q=>q[key]).filter(Boolean))].sort();
 facets.supplier=[...new Set(base.flatMap(q=>(q.suppliers||[]).map(s=>s.name)))].sort();
 const all=base.filter(q=>(p.quick==='open'?(M.open(q)||q.status==='DRAFT'):M.quick(q,p.quick||'all',now))&&Object.entries(f).every(([key,v])=>{
  if(!v||key==='clientKey')return true;
  if(key==='search')return M.norm([q.code,q.project_name,q.client_name,q.service,...(q.suppliers||[]).map(s=>s.name)].join(' ')).includes(M.norm(v));
  if(key==='supplier')return (q.suppliers||[]).some(s=>s.name===v);
  if(key==='deadline')return M.day(q.expires_at)<=v;
  if(key==='from'||key==='to'){const day=M.day(q.created_at);return key==='from'?day>=v:day<=v;}
  return q[key]===v;
 }));
 const priority=q=>M.quick(q,'late',now)?0:M.quick(q,'due',now)?1:q.status==='READY'?2:q.status==='PARTIAL'?3:M.open(q)?4:5;
 const value=q=>p.sort==='deadline'?Date.parse(q.expires_at):p.sort==='created'?Date.parse(q.created_at):p.sort==='value'?Number(q.estimated_value):p.sort==='responses'?q.received:p.sort==='project'?q.project_name:p.sort==='status'?q.status:priority(q);
 all.sort((a,b)=>{const av=value(a),bv=value(b),diff=typeof av==='string'?av.localeCompare(bv,'pt-BR'):av-bv;return diff*(p.sort==='attention'||p.direction!=='desc'?1:-1)||Date.parse(b.created_at)-Date.parse(a.created_at)||a.id.localeCompare(b.id)});
 return {...paginate(all,p.page,p.pageSize),facets,kpis:M.kpis(base,now)};
}
const model={identity,build,clientsPage,quotesPage};root.CamberQuoteClients=model;if(typeof module==='object')module.exports=model;
})(typeof window==='object'?window:globalThis);
