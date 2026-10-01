const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const M=require('../cotacoes-model.js'),P=require('../cotacoes-impressao.js'),Legacy=require('../oportunidade-propostas-model.js');
const {detail,request}=require('./cotacoes-impressao-fixture.cjs');
const money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const Q={esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),money};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cotacoes-layout.js'),'utf8'),{CamberQuotes:Q,window:{CamberQuoteModel:M},document:{createElement:()=>({}),body:{append(){}}}});
const clone=x=>JSON.parse(JSON.stringify(x));
const data={...clone(detail),financial:null,requests:[request('a','MARMORARIA CARVALHO LTDA',5000,40),request('b','BDC COMERCIO E INDUSTRIA DE PEDRAS LTDA',6000,60)]};
data.quotation.service='Marmoraria';data.quotation.code='TESTE LOCAL';
data.quotation.specification={title:'Bancada de pedra',description:'Exemplo de comparação entre fornecedores.',items:[{id:'i1',title:'PEDRA PRETA 2,00 X 3,00',quantity:1,unit:'un'}]};
for(const r of data.requests){r.response.subtotal=r.response.total;r.response.freight=0;r.response.items=[{...data.quotation.specification.items[0],unitPrice:r.response.total,value:r.response.total,days:r.response.days}];}
const row=d=>Q.comparisonHTML(d).match(/<th colspan="2" scope="row">Economia R\$ \/ %<\/th>([\s\S]*?)<\/tr>/)[1];
const cells=d=>[...row(d).matchAll(/<td>([\s\S]*?)<\/td>/g)].map(x=>x[1]);
const before=JSON.stringify(data);
assert.equal(M.savings(5000,6000).amount,1000);
assert(Math.abs(M.savings(5000,6000).percent-16.666666666666668)<1e-9);
assert.equal(M.savings(0,100).percent,100);
assert.equal(M.savings(0,0).percent,null);
for(const bad of [null,undefined,'',NaN,Infinity,-1])assert.equal(M.savings(bad,100),null);
assert.equal(M.savings(200,100),null);
let c=cells(data);assert(c[0].includes('1.000,00'));assert(c[0].includes('16,67%'));assert.equal(c[1],'Maior valor · referência');
c=cells({...data,requests:[...data.requests].reverse()});assert.equal(c[0],'Maior valor · referência');assert(c[1].includes('1.000,00'));
c=cells({...data,requests:[...data.requests,request('c','Intermediária',5500,30)]});assert(c[2].includes('500,00'));assert(c[2].includes('8,33%'));
c=cells({...data,requests:[request('a','A',5000,10),request('b','B',5000,10)]});assert.deepEqual(c,['Sem diferença','Sem diferença']);
c=cells({...data,requests:[request('a','A',0,10),request('b','B',0,10)]});assert.deepEqual(c,['Sem diferença','Sem diferença']);
c=cells({...data,requests:[request('a','Gratuita',0,10),request('b','B',6000,10)]});assert(c[0].includes('100%'));
c=cells({...data,requests:[data.requests[0],{id:'b',status:'INVITED',supplier_name:'B'}]});assert.deepEqual(c,['Aguardando outra proposta','—']);
for(const change of [{active:false},{status:'DISQUALIFIED'},{status:'DECLINED'},{status:'EXPIRED'},{revision:2}]){const invalid={...request('x','Não comparável',99000,1),...change};c=cells({...data,requests:[...data.requests,invalid]});assert(c[0].includes('1.000,00'));assert.equal(c[2],'Não comparável');}
c=cells({...data,requests:[...data.requests,request('x','Sem preço',null,1)]});assert.equal(c[2],'Não comparável');
for(const layout of ['table','summary','detailed']){const html=P.documentHTML(data,{layout});assert(html.includes('1.000,00 / 16,67% de economia'));assert(html.includes('Maior valor · referência'));assert(!html.includes('20%'));assert(!html.includes('NaN'));assert(!html.includes('Infinity'));}
const adjusted={...data,clientPrices:[{proposalId:'p-a',value:5500},{proposalId:'p-b',value:6000}]};assert(P.documentHTML(adjusted).includes('500,00 / 8,33% de economia'));
const legacy=Legacy.analyze([{value:5000,days:10},{value:6000,days:15},{value:0,days:null}]);assert.equal(legacy.maxPrice,6000);assert.equal(legacy.priceCount,2);
assert.equal(JSON.stringify(data),before);
console.log('PASS: economia na coluna mais barata, ordem inversa, 3 fornecedores, empate, zero, ausentes, versões antigas, excluídos, impressão e preço ao cliente.');
if(process.argv.includes('--fixture')){
 const preview=path.resolve(__dirname,'../../gestao-camber-agenda');
 fs.writeFileSync(path.join(preview,'qa-economia.html'),'<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Teste do comparativo</title><link rel="stylesheet" href="cotacoes.css"><link rel="stylesheet" href="cotacoes-layout.css"><body style="margin:0;background:#f3f0e8;font:14px Arial;padding:24px"><p>TESTE LOCAL · Dados de exemplo, sem gravação</p><main class="cq-page cq-panel">'+Q.comparisonHTML(data)+'</main></body></html>');
 fs.writeFileSync(path.join(preview,'qa-economia-relatorio.html'),P.documentHTML(data));
}
