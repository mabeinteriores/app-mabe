const assert=require('node:assert/strict');
const C=require('../cotacoes-clients-model.js');
const now=new Date('2026-10-01T12:00:00Z');
const clients=[{id:'a',nome:'Mesmo nome'},{id:'b',nome:'Mesmo nome'},{id:'c',nome:'Único'}];
const projects=[{id:'p1',clienteId:'a',cliente:'Nome antigo',nome:'Apartamento'},{id:'p2',clienteId:'a',cliente:'Outra grafia',nome:'Casa'},{id:'p3',clienteId:'b',nome:'Escritório'},{id:'p4',cliente:'único',nome:'Loja'},{id:'p5',cliente:'Mesmo nome',nome:'Legado ambíguo'},{id:'p6',cliente:'Sem cotação',nome:'Obra nova'}];
const quote={project_id:'p1',project_name:'Apartamento',client_name:'Nome antigo',service:'Marcenaria',responsible:'Rafael',state:'OPEN',status:'PARTIAL',awaiting:1,invited:2,received:1,unviewed:0,estimated_value:10,expires_at:'2026-09-30T23:59:59-03:00',created_at:'2026-10-01T10:00:00Z',suppliers:[{id:'s1',name:'Fornecedor Um'}]};
const rows=Array.from({length:105},(_,i)=>({...quote,id:'a-'+i,code:'COT-'+i,awaiting:i===0?1:0,status:i===0?'PARTIAL':'READY'}));
rows.push({...quote,id:'a-casa',code:'CASA',project_id:'p2',project_name:'Casa',status:'READY',awaiting:0,estimated_value:20},
 {...quote,id:'a-closed',code:'CLOSED',state:'CLOSED',status:'CLOSED'},
 {...quote,id:'a-canceled',code:'CANCELED',status:'CANCELED'},
 {...quote,id:'b-quote',code:'OTHER',project_id:'p3',project_name:'Escritório'},
 {...quote,id:'c-quote',code:'UNIQUE',project_id:'p4',project_name:'Loja'});
const snapshot=C.build(projects,clients,rows,now),a=snapshot.clients.find(c=>c.client_key==='client:a');
assert.equal(a.client_name,'Mesmo nome');assert.equal(a.projects.length,2);assert.equal(a.open,106);assert.equal(a.total,108);assert.equal(a.value,1070);assert.equal(a.late,1);
assert.equal(snapshot.clients.find(c=>c.client_key==='client:b').open,1);
assert.equal(C.identity(projects[3],clients).client_key,'client:c');
assert.equal(C.identity(projects[4],clients).client_key,'project:p5');
assert.equal(C.clientsPage(snapshot,{clientKey:'name:sem cotação'}).clients[0].open,0);
assert.equal(C.clientsPage(snapshot,{scope:'open'}).total,3);
assert.equal(C.clientsPage(snapshot,{search:'unico'}).total,1);
assert.equal(C.clientsPage(snapshot,{search:'casa'}).clients[0].client_key,'client:a');
assert.equal(C.clientsPage(snapshot,{page:2,pageSize:1}).clients.length,1);
let result=C.quotesPage(snapshot,'client:a',{quick:'open',page:1,pageSize:25},now);
assert.equal(result.total,106);assert.equal(result.rows.length,25);assert.equal(result.kpis.open,106);assert.equal(result.kpis.late,1);
assert.ok(result.rows.every(q=>q.client_key==='client:a'));
assert.deepEqual(result.facets.project_name.sort(),['Apartamento','Casa']);
assert.equal(C.quotesPage(snapshot,'client:a',{quick:'open',page:5,pageSize:25},now).rows.length,6);
assert.equal(C.quotesPage(snapshot,'client:a',{quick:'closed'},now).total,1);
assert.equal(C.quotesPage(snapshot,'client:a',{quick:'all'},now).total,108);
assert.equal(C.quotesPage(snapshot,'client:a',{quick:'open',filters:{search:'escritorio'}},now).total,0);
assert.equal(C.quotesPage(snapshot,'client:a',{quick:'open',filters:{project_name:'Casa'}},now).total,1);
assert.equal(C.quotesPage(snapshot,'client:a',{quick:'late'},now).total,1);
assert.equal(C.quotesPage(snapshot,'client:a',{quick:'ready'},now).total,105);
assert.equal(C.quotesPage(snapshot,'client:a',{quick:'open',sort:'value',direction:'desc'},now).rows[0].id,'a-casa');
assert.equal(C.quotesPage(snapshot,'unknown',{quick:'all'},now).total,0);
assert.equal(rows[0].client_key,undefined,'Não deve alterar dados originais');
console.log('30 verificações aprovadas: clientes, homônimos, legado, 110 cotações, paginação, filtros, KPIs e histórico.');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
async function loaderTest(mode){
 const pages=[],Q={esc:String,api:async(action,p)=>{if(action==='catalog')return {projects};pages.push(p.page);return {total:mode==='changed'&&p.page===2?rows.length+1:rows.length,rows:mode==='duplicate'&&p.page===2?rows.slice(0,10):rows.slice((p.page-1)*100,p.page*100)}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cotacoes-clients.js'),'utf8'),{CamberQuotes:Q,CamberQuoteClients:C,CamberCloud:{atualizarClientes:async()=>{}},localStorage:{getItem:()=>JSON.stringify(clients)}});
 if(mode==='ok'){const data=await Q.loadClientSnapshot();assert.equal(data.quotes.length,110);assert.deepEqual(pages,[1,2]);assert.equal(data.clients.find(c=>c.client_key==='client:a').open,106)}
 else await assert.rejects(()=>Q.loadClientSnapshot(),/lista de cotações mudou/);
}
Promise.all(['ok','changed','duplicate'].map(loaderTest)).then(()=>console.log('Leitura de todas as páginas e proteção contra lista incompleta aprovadas.')).catch(e=>{console.error(e);process.exitCode=1});
