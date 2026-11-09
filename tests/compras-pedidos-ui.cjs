const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),site='https://camber.test';
const pageHTML=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="cotacoes.css"><link rel="stylesheet" href="compras-pedidos.css"><div id="app" data-page="compras"><main id="cq-main" class="cq-office"></main></div>
<script src="cotacoes-shared.js"></script><script src="cotacoes-model.js"></script><script src="cotacoes-wizard.js"></script>
<script>
const Q=CamberQuotes;Q.ready=async()=>{};
var order=JSON.parse(sessionStorage.getItem('order')||'null')||{
 id:'p',quotation_id:'q',code:'PC-TESTE',service:'Marcenaria',project_name:'Obra fictícia',supplier_name:'Empresa fictícia',
 expected_delivery:'2026-12-10',state:'PENDING_APPROVAL',edit_version:0,
 response:{items:[{title:'Armário',quantity:1,unit:'un',unitPrice:5000,value:5000}],total:5000,payment:'50/50'}
};
Q.api=async(action,p)=>{
 if(action==='purchases')return [structuredClone(order)];
 if(action!=='purchase_change'||p.id!==order.id||p.expectedVersion!==order.edit_version)throw Error('Conflito de versão');
 if(p.operation==='edit')Object.assign(order,{order_total:p.total,order_content:p.content,order_payment_terms:p.paymentTerms,order_notes:p.notes,expected_delivery:p.expectedDelivery,confirmed_delivery:p.confirmedDelivery,state:p.orderState,payment_state:p.paymentState,delivery_state:p.deliveryState,installation_state:p.installationState});
 else order.deleted_at=p.operation==='trash'?'2026-11-08':null;
 order.edit_version++;
 sessionStorage.setItem('order',JSON.stringify(order));return {ok:true};
};
</script><script src="compras-pedidos.js"></script><script src="cotacoes-central.js"></script>`;
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:900}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>{
    const u=new URL(r.request().url());
    if(u.origin!==site)return r.abort();
    if(u.pathname==='/compras.html')return r.fulfill({contentType:'text/html',body:pageHTML});
    return r.fulfill({contentType:u.pathname.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(path.join(root,u.pathname.slice(1)))});
   });
   await page.goto(site+'/compras.html');
   await page.locator('[data-orders] tr').first().waitFor({state:'attached'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.getByRole('button',{name:'Editar',exact:true}).click();
   const d=page.getByRole('dialog');
   await d.locator('[data-item="quantity"]').fill('2');
   await d.locator('[data-item="unitPrice"]').fill('2400');
   await d.getByRole('button',{name:'+ Adicionar item'}).click();
   await d.locator('[data-item="title"]').last().fill('Painel');
   await d.locator('[data-item="unitPrice"]').last().fill('200');
   await d.getByRole('button',{name:'+ Adicionar item'}).click();
   await d.getByRole('button',{name:'Remover item'}).last().click();
   await d.locator('[name="discountPercent"]').fill('10');
   await d.locator('[name="freight"]').fill('50');
   assert.match(await d.locator('[data-calculated]').innerText(),/4\.550,00/);
   await d.locator('[name="payment"]').selectOption('card');
   await d.locator('[name="installments"]').selectOption('4');
   await d.locator('[name="delivery"]').fill('2026-12-11');
   await d.locator('[name="paymentState"]').selectOption('PARTIAL');
   await d.locator('[name="notes"]').fill('Avisar na chegada');
   await d.getByRole('button',{name:'Salvar alterações'}).click();
   await d.waitFor({state:'detached'});
   assert.match(await page.locator('[data-orders]').innerText(),/4\.550,00/);
   await page.reload();
   await page.getByRole('button',{name:'Abrir pedido'}).click();
   assert.match(await d.innerText(),/4x no cartão/);
   assert.match(await d.innerText(),/Avisar na chegada/);
   assert.match(await d.innerText(),/Parcialmente pago/);
   await d.locator('summary').click();
   assert.equal(await page.evaluate(()=>order.response.total),5000);
   await d.getByRole('button',{name:'Excluir',exact:true}).click();
   await d.getByRole('button',{name:'Voltar'}).click();
   assert.equal(await page.locator('[data-orders] tbody tr').count(),1);
   await page.getByRole('button',{name:'Excluir',exact:true}).click();
   await d.getByRole('button',{name:'Excluir pedido',exact:true}).click();
   await page.getByText('Nenhum pedido de compra.').waitFor();
   await page.getByRole('button',{name:'Lixeira',exact:true}).click();
   assert.match(await page.locator('[data-orders]').innerText(),/PC-TESTE/);
   await page.goto(site+'/compras.html?id=p');
   await d.getByRole('button',{name:'Restaurar',exact:true}).click();
   await d.getByRole('button',{name:'Restaurar pedido',exact:true}).click();
   await page.getByText('A Lixeira de compras está vazia.').waitFor();
   await page.getByRole('button',{name:'Pedidos',exact:true}).click();
   assert.match(await page.locator('[data-orders]').innerText(),/PC-TESTE/);
   assert.equal(await page.evaluate(()=>order.edit_version),3);
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS: edição de itens, cálculo, pagamento, acompanhamento, reabertura, exclusão e restauração no computador e celular.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
