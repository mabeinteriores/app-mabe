const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,channel:"msedge"});const page=await browser.newPage({viewport:{width:1220,height:850}});await page.route('**/*',r=>r.abort());
const model=fs.readFileSync(__dirname+'/../oportunidade-propostas-model.js','utf8'),source=fs.readFileSync(__dirname+'/../oportunidade-propostas.js','utf8');
const css=fs.readFileSync(__dirname+'/../oportunidade-propostas.css','utf8');
await page.setContent('<style>:root{--ink:#292720;--ink-3:#777;--surface:#fffdf9;--hair:#ddd;--hair-2:#ddd}body{padding:20px;background:#f7f5f1}'+css+'</style><div id="app"><div class="wrap"></div></div>');
await page.addScriptTag({content:model});
await page.addScriptTag({content:`
window.PROJ={id:'p',nome:'Obra fictícia'};window.projId='p';window.SLAB={prop:'Proposta enviada'};window.__camberProfile={nome:'QA'};
window.qa={fail:false,failRefresh:false,calls:[],o:{id:'opp',et:'prop',serv:'Marcenaria',favoriteProposalId:'a',supplierMutation:'v1',proposals:[{id:'a',name:'A <Fornecedor>',value:180000,rt:10,rtTipo:'pct',status:'Proposta recebida'},{id:'b',name:'B',value:203000,rt:10,rtTipo:'pct',status:'Aguardando proposta'}]}};
window.CamberDB={newId:()=>1,loadOpps:()=>[qa.o],loadFornecedores:()=>[],rtOf:()=>0};
window.CamberCloud={flush:async()=>true,atualizarOportunidades:async()=>{if(qa.failRefresh)throw Error('Sem conexão');},atualizarProjetos:async()=>{}};
window.CamberQuotes={avatar:()=>'',api:async(a,p)=>{qa.calls.push({a,p});if(qa.fail)throw Error('Falha simulada');qa.o=CamberProposals.apply(qa.o,'remove',{id:p.proposalId});qa.o.supplierMutation='v2';return {ok:true};}};
`});
// Keep production source intact apart from the URL input in this offline harness.
await page.addScriptTag({content:source.replace('new URLSearchParams(location.search)',"new URLSearchParams('?area=oportunidades&opp=opp')")});
const buttons=page.locator('[data-action="remove-supplier"]');assert.equal(await buttons.count(),2);
await buttons.first().click();assert.equal(await page.locator('#sp-remove-supplier').count(),1);assert.match(await page.locator('#sp-remove-supplier').innerText(),/A <Fornecedor>/);assert.equal(await page.locator('#sp-remove-supplier fornecedor').count(),0);
await page.locator('#sp-remove-supplier [data-close]').click();assert.equal(await page.evaluate(()=>qa.calls.length),0);
await buttons.first().click();await page.evaluate(()=>qa.fail=true);await page.locator('[data-remove-confirm]').click();await page.waitForFunction(()=>document.querySelector('.sp-error').textContent.includes('Falha simulada'));assert.equal(await buttons.count(),2);assert.equal(await page.locator('[data-remove-confirm]').isEnabled(),true);
await page.evaluate(()=>qa.fail=false);await page.locator('[data-remove-confirm]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-action="remove-supplier"]').length===1);assert.equal(await page.locator('#sp-remove-supplier').isVisible(),false);assert.equal((await page.evaluate(()=>qa.calls[1])).a,'remove_supplier');assert.deepEqual((await page.evaluate(()=>qa.calls[1])).p,{projectId:'p',opportunityId:'opp',proposalId:'a',expectedMutation:'v1'});
await page.setViewportSize({width:390,height:850});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
await page.locator('[data-action="remove-supplier"]').click();await page.evaluate(()=>qa.failRefresh=true);await page.locator('[data-remove-confirm]').click();await page.waitForFunction(()=>document.querySelector('.sp-error').textContent.includes('A remoção foi salva'));assert.equal(await page.locator('[data-remove-confirm]').isEnabled(),true);
await browser.close();console.log('PASS: UI real em navegador offline, botão por fornecedor, confirmação/cancelamento, escape de nome, falha/repetição, contrato da API, atualização após sucesso, tela móvel e aviso de remoção salva.');})().catch(e=>{console.error(e);process.exitCode=1;});

