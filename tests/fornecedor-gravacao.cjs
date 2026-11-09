const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),key='mabe-fornecedores-v1',read=p=>fs.readFileSync(path.join(root,p),'utf8'),html=read('fornecedor.html');
const form=html.slice(html.indexOf('  function irPara('),html.indexOf('  function excluirFornec('));
function session(seed,id='1'){
 let server=structuredClone(seed),stamp='2026-01-01T00:00:00Z',fail=false,writes=0;
 class Storage{constructor(){this.map=new Map()}getItem(k){return this.map.get(k)??null}setItem(k,v){this.map.set(k,String(v))}removeItem(k){this.map.delete(k)}}
 const ls=new Storage();ls.setItem(key,JSON.stringify(seed));
 const adapter={from(){let payload,opts={};const q={select(){return q},eq(k,v){opts[k]=v;return q},maybeSingle(){return q},update(v){payload=v;return q},then(resolve,reject){return Promise.resolve().then(()=>{if(fail){fail=false;return {error:{message:'Falha de conexão simulada'}}}if(!payload)return {data:{value:structuredClone(server),updated_at:stamp}};if(opts.updated_at!==stamp)return {data:[]};server=structuredClone(payload.value);stamp=payload.updated_at;writes++;return {data:[{key}]}}).then(resolve,reject)}};return q}};
 const inputs={fRazao:'Fornecedor QA',doc:seed[0]?.doc||'',fFant:'Editado',rtdef:'10',fPgto:'À vista',fPrazoMedio:'21',fAvaliacao:'4',fObs:'Conferir entrega'},alerts=[];
 const el={style:{},appendChild(){},remove(){},focus(){},scrollIntoView(){},addEventListener(){}};
 const c={Storage,localStorage:ls,sessionStorage:new Storage(),crypto:require('node:crypto').webcrypto,URLSearchParams,location:{hash:'',hostname:'qa.invalid',protocol:'https:',pathname:'/fornecedor.html',href:''},setTimeout:()=>1,clearTimeout(){},addEventListener(){},document:{head:el,body:el,readyState:'loading',createElement:()=>({...el}),addEventListener(){},getElementById:()=>({...el,checked:true,value:''}),querySelector:()=>({dataset:{t:'pj'}}),querySelectorAll:()=>[]},alert:x=>alerts.push(String(x)),fval:k=>inputs[k]||'',getCats:()=>['Marcenaria'],getContatos:()=>[],editId:id,fornecedorCarregado:true,conviteToken:null,salvandoFornecedor:false,convitePronto:true};
 c.window=c;c.parent=c;vm.createContext(c);vm.runInContext(read('cloud.js').replace('  // ---------- 2) overlay','  window.startTest=(a)=>{sb=a;ready=true};\n  // ---------- 2) overlay'),c);c.startTest(adapter);vm.runInContext(read('projects-data.js'),c);vm.runInContext(form,c);
 return {c,inputs,alerts,writes:()=>writes,server:()=>server,fail:()=>{fail=true},save:async(flag)=>{await c.salvar(flag);await new Promise(r=>setImmediate(r))}};
}
(async()=>{
 const row={id:1,nome:'Fornecedor QA',doc:'12.ABC.345/01DE-35',extra:'preservar'};
 let s=session([row]);await s.save();assert.equal(s.server()[0].fantasia,'Editado');assert.equal(s.c.location.href,'fornecedores.html','Gravação confirmada não retornou à lista');assert.deepEqual(s.alerts,[]);assert.equal(s.server()[0].extra,'preservar');assert.equal(s.writes(),1);assert.equal(await s.c.CamberCloud.flush(),true);
 assert.equal(s.server()[0].pagamentoPadrao,'À vista');assert.equal(s.server()[0].prazoMedioDias,21);assert.equal(s.server()[0].avaliacao,'4');assert.equal(s.server()[0].obs,'Conferir entrega');
 s=session([row]);s.fail();await s.save();assert.equal(s.c.location.href,'');assert.equal(s.server()[0].fantasia,undefined);assert(s.alerts.length);await s.save();assert.equal(s.c.location.href,'fornecedores.html');assert.equal(s.server().length,1);assert.equal(s.writes(),1);
 s=session([row,{id:2,nome:'Outro registro',doc:'12ABC34501DE35'}]);await s.save();assert.equal(s.c.location.href,'fornecedores.html');assert.equal(s.server()[1].nome,'Outro registro');
 s=session([row,{id:2,nome:'Outro',doc:'04.252.011/0001-10'}]);s.inputs.doc='04252011000110';await s.save();assert.equal(s.writes(),0);assert.equal(s.c.location.href,'');assert(s.alerts[0].includes('já está cadastrado'));
 s=session([row],'999');await s.save();assert.equal(s.writes(),0);assert.equal(s.c.location.href,'');
 s=session([row]);await Promise.all([s.save(),s.save()]);assert.equal(s.writes(),1);
 s=session([row]);await s.save(true);assert.equal(s.c.location.href,'fornecedor.html');assert.equal(s.writes(),1);
 console.log('PASS: gravação confirmada, falha e repetição, clique duplo, documento repetido preexistente, nova duplicação bloqueada e registro ausente.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
