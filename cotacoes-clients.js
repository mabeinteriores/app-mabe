(function(){
'use strict';
const Q=CamberQuotes,E=Q.esc;
Q.loadClientCatalog=async function(){
 const [catalog]=await Promise.all([Q.api('catalog'),CamberCloud.atualizarClientes()]);
 const clients=JSON.parse(localStorage.getItem('mabe-clientes-v1')||'[]');
 if(!Array.isArray(clients))throw Error('Não foi possível ler o cadastro de clientes.');
 return {catalog,clients};
};
Q.loadClientSnapshot=async function(){
 const [{catalog,clients},first]=await Promise.all([Q.loadClientCatalog(),Q.api('dashboard',{page:1,pageSize:100,sort:'created',direction:'asc'})]);
 const rows=first.rows.slice();
 for(let page=2;page<=Math.ceil(first.total/100);page++){const next=await Q.api('dashboard',{page,pageSize:100,sort:'created',direction:'asc'});if(next.total!==first.total)throw Error('A lista de cotações mudou durante a consulta. Clique em Atualizar.');rows.push(...next.rows)}
 if(new Set(rows.map(q=>q.id)).size!==first.total)throw Error('A lista de cotações mudou durante a consulta. Clique em Atualizar.');
 return CamberQuoteClients.build(catalog.projects,clients,rows);
};
Q.ClientDirectory=class {
 constructor(root){
  this.root=root;this.page=1;this.sequence=0;this.snapshot=null;
  root.innerHTML='<header class="page-h"><div><div class="crumb">Compras e fornecedores</div><h1>Cotações por cliente</h1><p>Escolha um cliente para acompanhar as cotações dos seus projetos.</p></div><div class="cq-actions"><button data-action="refresh">Atualizar</button><button class="primary" data-action="new">+ Nova cotação</button></div></header><div class="cq-client-totals" data-client-totals></div><section class="cq-panel"><div class="cq-client-filters"><label>Buscar cliente ou projeto<input type="search" data-client-search placeholder="Digite o nome do cliente ou projeto…"></label><label>Mostrar<select data-client-scope><option value="all">Todos os clientes com projetos</option><option value="open">Com cotações em aberto</option></select></label></div><p data-count role="status">Carregando clientes…</p><p data-status class="cq-error" role="status"></p><div class="cq-client-grid" data-clients></div><footer class="cq-pagination"><span data-page-label></span><div><button data-client-prev>← Anterior</button><button data-client-next>Próxima →</button></div></footer></section>';
  root.querySelector('[data-client-search]').oninput=()=>this.schedule(250);
  root.querySelector('[data-client-scope]').onchange=()=>this.schedule(0);
  root.querySelector('[data-client-prev]').onclick=()=>{this.page--;this.load()};
  root.querySelector('[data-client-next]').onclick=()=>{this.page++;this.load()};
 }
 schedule(ms){clearTimeout(this.timer);this.sequence++;this.page=1;this.timer=setTimeout(()=>this.load(),ms)}
 async load(refresh=false){
  clearTimeout(this.timer);const seq=++this.sequence,r=this.root;
  r.querySelector('[data-clients]').setAttribute('aria-busy','true');r.querySelectorAll('[data-client-prev],[data-client-next]').forEach(b=>b.disabled=true);
  try{
   const snapshot=refresh||!this.snapshot?await Q.loadClientSnapshot():this.snapshot;
   if(seq!==this.sequence)return;this.snapshot=snapshot;
   const data=CamberQuoteClients.clientsPage(snapshot,{page:this.page,pageSize:24,search:r.querySelector('[data-client-search]').value.trim(),scope:r.querySelector('[data-client-scope]').value});
   if(seq!==this.sequence)return;this.page=data.page;
   r.querySelector('[data-client-totals]').innerHTML='<span><b>'+data.totals.clients+'</b> clientes</span><span><b>'+data.totals.open+'</b> cotações em aberto</span><span class="'+(data.totals.late?'cq-client-late':'')+'"><b>'+data.totals.late+'</b> atrasadas</span>';
   r.querySelector('[data-count]').textContent=data.total+(data.total===1?' cliente encontrado':' clientes encontrados');
   r.querySelector('[data-clients]').innerHTML=data.clients.map(c=>'<a class="cq-client-card" href="cotacoes.html?client='+encodeURIComponent(c.client_key)+'" aria-label="Abrir cotações de '+E(c.client_name)+'"><div class="cq-client-title">'+Q.avatar(c.client_name)+'<h2>'+E(c.client_name)+'</h2><span aria-hidden="true">→</span></div><p class="cq-client-projects">'+c.projects.map(p=>E(p.name)).join(' · ')+'</p><div class="cq-client-metrics"><div><strong>'+c.open+'</strong><small>Em aberto</small></div><div><strong>'+c.awaiting+'</strong><small>Aguardando resposta</small></div><div><strong>'+c.ready+'</strong><small>Para comparar</small></div></div>'+(c.late?'<p class="cq-client-late">● '+c.late+' cotação(ões) atrasada(s)</p>':'<p class="cq-muted">'+(c.open?'Nenhuma cotação atrasada':'Nenhuma cotação em aberto')+'</p>')+'<footer><span>Valor em cotação<strong>'+Q.money(c.value)+'</strong></span><b>Ver cotações →</b></footer></a>').join('')||'<div class="cq-empty"><h2>Nenhum cliente encontrado</h2><p>Confira a busca ou vincule um cliente a um projeto.</p></div>';
   const pages=Math.max(1,Math.ceil(data.total/data.pageSize));r.querySelector('[data-page-label]').textContent='Página '+data.page+' de '+pages;r.querySelector('[data-client-prev]').disabled=data.page<=1;r.querySelector('[data-client-next]').disabled=data.page>=pages;r.querySelector('[data-status]').textContent='';
  }catch(e){if(seq!==this.sequence)return;r.querySelector('[data-clients]').innerHTML='';r.querySelector('[data-count]').textContent='Não foi possível carregar os clientes. Use Atualizar para tentar novamente.';r.querySelector('[data-status]').textContent=e.message}
  finally{if(seq===this.sequence)r.querySelector('[data-clients]').removeAttribute('aria-busy')}
 }
};
})();
