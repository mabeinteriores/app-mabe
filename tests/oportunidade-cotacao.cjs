const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../oportunidade-cotacao.js');
for(const from of ['prospec','negoc','prop','win','lost'])for(const to of ['prospec','negoc','prop','win','lost'])assert.equal(M.shouldAsk(from,to),to==='prop'&&['prospec','negoc'].includes(from));
assert.deepEqual(M.choices({id:1,forn:'a definir'}),[]);
assert.deepEqual(M.choices({id:1,forn:'Legado'}),[{id:'legacy-1',name:'Legado',supplierId:null}]);
const multi={favoriteProposalId:'b',proposals:[{id:'a',name:'Alfa',supplierId:1},{id:'b',name:'Beta',supplierId:2}]};
assert.equal(M.preferred(multi,M.choices(multi)).id,'b');assert.equal(M.preferred({},M.choices(multi)).id,'a');
const html=fs.readFileSync(__dirname+'/../projeto.html','utf8');
const source=html.slice(html.indexOf('var movingOpp = false;'),html.indexOf('// ---------- comemoração'));
async function move(from,to,handled){
 let asks=0,renders=0;const o={id:1,et:from};const ctx={opps:[o],PROJ:{id:1},alert:()=>{},openOpportunity:()=>{},render:()=>renders++,CamberQuotes:{proposalTransition:async()=>{asks++;return handled}},window:null};ctx.window=ctx;
 vm.createContext(ctx);vm.runInContext(source,ctx);await ctx.moveOpp(1,to);return {asks,renders,stage:o.et};
}
(async()=>{
 for(const from of ['prospec','negoc']){
  assert.deepEqual(await move(from,'prop',false),{asks:1,renders:1,stage:'prop'});
  assert.deepEqual(await move(from,'prop',true),{asks:1,renders:0,stage:from});
 }
 assert.deepEqual(await move('lost','prop',false),{asks:0,renders:1,stage:'prop'});
 assert.deepEqual(await move('prospec','negoc',false),{asks:0,renders:1,stage:'negoc'});
 assert.deepEqual(await move('prop','prop',false),{asks:0,renders:0,stage:'prop'});
 assert.deepEqual(await move('prospec','win',false),{asks:0,renders:0,stage:'prospec'});
 let finish,asks=0,renders=0;const ctx={opps:[{id:1,et:'prospec'},{id:2,et:'negoc'}],PROJ:{id:1},alert:()=>{},render:()=>renders++,CamberQuotes:{proposalTransition:()=>{asks++;return new Promise(r=>finish=r)}},window:null};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
 const pending=ctx.moveOpp(1,'prop');await ctx.moveOpp(2,'prop');assert.equal(asks,1);finish(false);await pending;assert.equal(ctx.opps[0].et,'prop');assert.equal(ctx.opps[1].et,'negoc');assert.equal(renders,1);
 console.log('PASS: 25 transições, escolha favorita/legado, Sim/Não, demais etapas e proteção de fechamento.');
})().catch(e=>{console.error(e);process.exitCode=1});
