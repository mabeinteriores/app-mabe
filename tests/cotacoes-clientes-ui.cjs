const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const screen=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="cotacoes-list.css"><div id="app" data-page="cotacoes"><main id="cq-main"></main></div>
<script src="cotacoes-model.js"></script><script src="cotacoes-clients-model.js"></script>
<script src="cotacoes-shared.js"></script><script src="cotacoes-clients.js"></script><script src="cotacoes-list.js"></script>
<script src="cotacoes-templates.js"></script><script src="cotacoes-wizard.js"></script><script src="cotacoes-control.js"></script>
<script>
const Q=CamberQuotes;
Q.avatar=()=>'';Q.ready=async()=>{};
const projects=[{id:'p1',cliente:'Ana',statusCls:'prop'},{id:'p2',cliente:'Bia',statusCls:'negoc'},
 {id:'p3',cliente:'Carol',statusCls:'prospec'},{id:'p4',cliente:'Ana',nome:'Projeto entregue',statusCls:'done'},
 {id:'p5',cliente:'Cliente antigo',statusCls:'win'}];
const quotes=['CLOSED','CANCELED','ARCHIVED','CLOSED','READY'].map((status,i)=>({
 project_id:i===3?'p2':'p1',id:String(i),code:'COT-'+i,status,state:status==='READY'?'OPEN':'CLOSED',
 suppliers:[],project_name:'Projeto '+i,created_at:'2026-11-01',expires_at:'2026-12-01',service:'Marcenaria',invited:1,received:1,awaiting:0
}));
quotes.push({...quotes[0],id:'inativa',project_id:'p4'},{...quotes[0],id:'excluida',project_id:'p99'});
Q.loadClientSnapshot=async()=>CamberQuoteClients.build(projects,[],quotes);
Q.quoteAside=()=>'';Q.stepper=()=>'';
const catalog={projects,opportunities:[],suppliers:[],responsibles:[]};
Q.loadClientCatalog=async()=>({catalog,clients:[]});
Q.api=async(action,p)=>{
 if(action==='catalog')return structuredClone(catalog);
 const q=quotes.find(q=>q.id===p.quotationId);
 if(action==='detail')return {quotation:{...q,specification:{title:'Pedido histórico',description:''}},requests:[]};
 if(action!=='workflow'||!q||p.expectedVersion!==(q.control_version||0))throw Error('Operação inválida no teste');
 if(p.state==='TRASH'){q.previous=q.status;q.workflow=q.status='TRASH';}
 else if(p.state==='RESTORE')q.workflow=q.status=q.previous;
 else throw Error('Ação inesperada');
 q.control_version=p.expectedVersion+1;return {ok:true};
};
</script><script src="cotacoes-central.js"></script>`;
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin!=='https://camber.test')return route.abort();
   if(url.pathname==='/cotacoes.html')return route.fulfill({contentType:'text/html',body:screen});
   return route.fulfill({body:fs.readFileSync(path.join(root,url.pathname.slice(1))),
    contentType:url.pathname.endsWith('.css')?'text/css':'application/javascript'});
  });
  for(const width of [1440,375]){
   await page.setViewportSize({width,height:800});
   await page.goto('https://camber.test/cotacoes.html');
   const closed=page.getByRole('link',{name:'Fechado · 1 · Ana',exact:true});
   await closed.waitFor({timeout:4500}).catch(async error=>{
    throw Error(error.message+' · '+errors.join(', ')+' · '+await page.locator('main').innerText());
   });
   assert.equal(await page.getByRole('link',{name:'Fechado · 0 · Carol',exact:true}).count(),1);
   assert.equal(await page.locator('.cq-client-card').count(),3);
   assert.doesNotMatch(await page.locator('[data-clients]').innerText(),/Cliente não informado|Cliente antigo|Projeto entregue/);
   await page.getByRole('button',{name:'+ Nova cotação'}).click();
   const options=await page.locator('dialog [name="project"] option').evaluateAll(opts=>opts.map(o=>o.value));
   assert.deepEqual(options,['','p1','p2','p3']);
   await page.getByRole('button',{name:'Fechar',exact:true}).click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await closed.click();
   const visibleRow=page.locator('[data-row]:visible');
   await visibleRow.first().waitFor({timeout:5000});
   assert.equal(await page.locator('[data-count]').innerText(),'1 cotação encontrada');
   assert.equal(await page.locator('[data-quick="closed"]').getAttribute('aria-pressed'),'true');
   assert.equal(await visibleRow.count(),1);
   assert.match(await visibleRow.innerText(),/COT-0/);
   assert.equal(new URL(page.url()).searchParams.get('client'),'name:ana');
   const menu=visibleRow.getByRole('button',{name:'Ações de COT-0'});
   await menu.click();
   await visibleRow.getByRole('button',{name:'Excluir cotação'}).click();
   let dialog=page.getByRole('dialog');
   assert.match(await dialog.innerText(),/COT-0/);
   await dialog.getByRole('button',{name:'Voltar'}).click();
   assert.equal(await visibleRow.count(),1);
   await menu.click();
   await visibleRow.getByRole('button',{name:'Excluir cotação'}).click();
   await page.getByRole('dialog').getByRole('button',{name:'Excluir cotação'}).click();
   await page.locator('[data-table] .cq-empty').waitFor();
   await page.locator('[data-quick="trash"]').click();
   await visibleRow.first().waitFor();
   await menu.click();
   await visibleRow.getByRole('button',{name:'Restaurar cotação'}).click();
   await page.getByRole('dialog').getByRole('button',{name:'Restaurar cotação'}).click();
   await page.locator('[data-table] .cq-empty').waitFor();
   await page.locator('[data-quick="closed"]').click();
   await visibleRow.first().waitFor();
   assert.match(await visibleRow.innerText(),/COT-0/);
  }
  await page.goto('https://camber.test/cotacoes.html?id=excluida');
  await page.getByText('Pedido histórico').waitFor();
  assert.equal(await page.locator('.crumb a[href*="?client="]').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: cartão Fechado, menu Ações, confirmação, cancelamento, exclusão e restauração da cotação no computador e celular.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
