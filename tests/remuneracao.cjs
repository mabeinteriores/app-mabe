const assert=require('node:assert/strict'),F=require('../remuneracao-model.js');
const v={...F.defaults(),mode:'both',rt:10,markup:2000,payer:'office',rtReceived:500,rtDate:'2026-10-01',markupReceived:1000,markupDate:'2026-10-01'};
const p={value:10000,remuneration:v,quoteResponse:{total:10000,subtotal:9500,discount:500,freight:800,assembly:200}};
assert.deepEqual(F.calculate(p),{cost:10000,base:10000,products:9000,rt:1000,markup:2000,client:12000,earned:3000,received:1500,pending:1500,supplierNet:9000,payer:'office'});
assert.equal(F.calculate({...p,remuneration:{...v,rtBase:'products'}}).rt,900);
assert.equal(F.calculate({...p,remuneration:{...v,rtBase:'custom',customBase:8000}}).rt,800);
assert.equal(F.calculate({...p,remuneration:{...v,mode:'markup',markupType:'pct',markup:20}}).earned,2000);
assert.equal(F.calculate({...p,remuneration:{...v,mode:'rt'}}).client,10000);
assert.equal(F.calculate({value:10000,rt:10,rtTipo:'pct'}).earned,1000);
assert.equal(F.calculate({value:10000,remuneration:{...v,rtBase:'products'}}).rt,null);
assert.throws(()=>F.validate({...v,rt:-1}));assert.throws(()=>F.validate({...v,rtDate:''}));assert.throws(()=>F.validate({...v,rtDate:'2026-02-31'}));
console.log('PASS: valores fornecedor/cliente, RT, acréscimo, ambos, recebimentos, bases, legado, dados ausentes e validação.');

const P=require('../cotacoes-impressao.js'),{detail}=require('./cotacoes-impressao-fixture.cjs'),d=structuredClone(detail);d.requests=d.requests.slice(0,1);d.requests[0].response.total=10000;d.financial=[{proposalId:d.requests[0].proposal_id,value:10000,remuneration:v}];
for(const layout of ['table','summary','detailed']){const client=P.documentHTML(d,{layout});assert(client.includes('12.000,00'));assert(!client.includes('10.000,00'));assert(!client.includes('Remuneração prevista'));assert(!client.includes('Acréscimo'));assert(!client.includes('1.500,00'));const internal=P.documentHTML(d,{layout,internal:true});assert(internal.includes('10.000,00'));assert(internal.includes('3.000,00'));assert(internal.includes('1.500,00'));}
console.log('PASS: três relatórios cliente/interno, preço final e sigilo dos valores internos.');