// Actual cloud.js refresh code, isolated from network and real browser data.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../cloud.js'),'utf8');
const start=source.indexOf('  // ---------- 5b)'),end=source.indexOf('  function afterAuth()');
assert(start>0&&end>start);
function fixture(){
 let reloads=0,banners=0,requests=0,editing=false,resolveRead;
 const values={'mabe_ind':'{"indicacoes":[]}'},button={style:{}};
 const storage={getItem:k=>values[k]??null};
 const document={activeElement:null,querySelector:()=>editing?{}:null,getElementById:()=>null,addEventListener(){},createElement:()=>({style:{},querySelector:()=>button}),body:{appendChild(){banners++}}};
 const query={select(){return this},eq(){return this},order(){return this},limit(){return this},then(ok,fail){requests++;return new Promise(r=>resolveRead=r).then(ok,fail)}};
 const sandbox={window:{addEventListener(){}},document,location:{reload(){reloads++}},localStorage:storage,
  WORKSPACE:"mabe",inFlight:false,pending:{},sb:{from:()=>query},ready:true,isChild:false,lastStamp:null,
  _set:(k,v)=>values[k]=v,_remove:k=>delete values[k],shouldSync:k=>k.startsWith('mabe'),currentFile:()=> 'indicacoes.html',
  setTimeout:f=>{f();return 1},clearTimeout(){},setInterval(){},console};
 vm.createContext(sandbox);vm.runInContext(source.slice(start,end)+'\nwindow.test={scheduleLive,tryLive,doLiveRefresh,onRemoteChange};',sandbox);
 return {api:sandbox.window.test,values,button,set editing(v){editing=v},get reloads(){return reloads},get banners(){return banners},get requests(){return requests},respond:async r=>{resolveRead(r);await new Promise(r=>setImmediate(r))}};
}
(async()=>{
 const a=fixture();for(let i=0;i<100;i++)a.api.scheduleLive();assert.equal(a.reloads,0);assert.equal(a.banners,1);assert.equal(a.requests,0);
 a.api.onRemoteChange({table:'kv_store',new:{key:'mabe_ind',value:{indicacoes:[{id:1}]}}});assert.equal(a.reloads,0);
 a.editing=true;a.api.doLiveRefresh();assert.equal(a.requests,0);a.editing=false;
 a.api.doLiveRefresh();a.api.doLiveRefresh();assert.equal(a.requests,1);
 await a.respond({error:{message:'offline'}});assert.equal(a.reloads,0);assert.equal(a.values.mabe_ind,'{"indicacoes":[]}');
 a.api.doLiveRefresh();a.editing=true;await a.respond({data:[{key:'mabe_ind',value:{indicacoes:[{id:1}]}}]});assert.equal(a.reloads,0);assert.equal(a.values.mabe_ind,'{"indicacoes":[]}');
 a.editing=false;a.api.doLiveRefresh();await a.respond({data:[{key:'mabe_ind',value:{indicacoes:[{id:1}]}}]});assert.equal(a.reloads,1);assert.equal(a.values.mabe_ind,'{"indicacoes":[{"id":1}]}');
 const b=fixture();b.api.doLiveRefresh();await b.respond({data:null});assert.equal(b.reloads,0);
 console.log('PASS: 100 notificações sem reload; aviso único; edição protegida; clique duplo; erro de rede; edição iniciada durante consulta; atualização explícita; resposta inválida.');
})().catch(e=>{console.error(e);process.exitCode=1});
