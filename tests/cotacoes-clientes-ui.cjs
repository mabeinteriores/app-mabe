const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const screen=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="cotacoes-list.css"><main></main>
<script src="cotacoes-model.js"></script><script src="cotacoes-clients-model.js"></script>
<script src="cotacoes-shared.js"></script><script src="cotacoes-clients.js"></script><script src="cotacoes-list.js"></script>
<script>
const Q=CamberQuotes;
Q.avatar=()=>'';Q.controlButtons=()=>'';
const projects=[{id:'p1',cliente:'Ana'},{id:'p2',cliente:'Bia'},{id:'p3',cliente:'Carol'}];
const quotes=['CLOSED','CANCELED','ARCHIVED','CLOSED','READY'].map((status,i)=>({
 project_id:i===3?'p2':'p1',id:String(i),code:'COT-'+i,status,state:status==='READY'?'OPEN':'CLOSED',
 suppliers:[],project_name:'Projeto '+i,created_at:'2026-11-01',expires_at:'2026-12-01',service:'Marcenaria',invited:1,received:1,awaiting:0
}));
const snapshot=CamberQuoteClients.build(projects,[],quotes);
Q.loadClientSnapshot=async()=>snapshot;
const client=snapshot.clients.find(c=>c.client_key===new URLSearchParams(location.search).get('client'));
const main=document.querySelector('main');
(client?new Q.CentralList(main,()=>{},()=>{},client,snapshot):new Q.ClientDirectory(main)).load();
</script>`;
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
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await closed.click();
   const visibleRow=page.locator('[data-row]:visible');
   await visibleRow.first().waitFor({timeout:5000});
   assert.equal(await page.locator('[data-count]').innerText(),'1 cotação encontrada');
   assert.equal(await page.locator('[data-quick="closed"]').getAttribute('aria-pressed'),'true');
   assert.equal(await visibleRow.count(),1);
   assert.match(await visibleRow.innerText(),/COT-0/);
   assert.equal(new URL(page.url()).searchParams.get('client'),'name:ana');
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: cartão Fechado no computador e celular, contagem zero, navegação e filtro somente do cliente.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
