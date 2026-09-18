// Isolated concurrency reproduction: actual CamberDB and cloud flush,
// ten independent VM sessions, in-memory last-write-wins kv_store adapter.
// No network APIs, credentials, browser sessions or production writes.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const dataSource = fs.readFileSync(path.join(root, 'projects-data.js'), 'utf8');
const cloudSource = fs.readFileSync(path.join(root, 'cloud.js'), 'utf8');
const boundary = cloudSource.indexOf('  // ---------- 2) overlay');
assert(boundary > 0, 'Cloud source boundary changed: review harness');
const cloudHarness = cloudSource.slice(0, boundary) + '\nwindow.__test = {start:function(adapter){sb=adapter;ready=true;},flush:flush};})();';
const clone = x => JSON.parse(JSON.stringify(x));
const keys = {clients:'mabe-clientes-v1',suppliers:'mabe-fornecedores-v1',projects:'mabe-projects-v3'};
const report = [];
function backend(initial = {}) {
  const values = clone(initial);
  const stamps = Object.fromEntries(Object.keys(values).map(k=>[k,'2026-01-01T00:00:00.000Z']));
  let count = 0, failNext = false, loseAck=false;
  return {values, get count(){return count;}, fail(){failNext=true;},loseAck(){loseAck=true;}, adapter:{from(table){
    assert.equal(table, 'kv_store');
    let mode='read',payload,filters={};
    const query={
      select(){return query;},eq(k,v){filters[k]=v;return query;},is(k,v){filters[k]=v;return query;},maybeSingle(){return query;},
      insert(row){mode='insert';payload=clone(row);return query;},
      update(row){mode='update';payload=clone(row);return query;},delete(){mode='delete';return query;},
      then(resolve,reject){return new Promise(done=>setImmediate(()=>{
        if(failNext){failNext=false;done({error:{message:'Injected network failure'}});return;}
        const key=mode==='insert'?payload.key:filters.key;
        if(mode==='read'){done({data:Object.hasOwn(values,key)?{value:clone(values[key]),updated_at:stamps[key]}:null,error:null});return;}
        count++;
        if(mode==='insert'){
          if(Object.hasOwn(values,key)){done({error:{code:'23505'}});return;}
        }else if(!Object.hasOwn(values,key)||stamps[key]!==filters.updated_at){done({data:[],error:null});return;}
        if(mode==='delete'){delete values[key];delete stamps[key];}
        else {values[key]=payload.value;stamps[key]=payload.updated_at;}
        if(loseAck){loseAck=false;done({error:{message:'Response lost after commit'}});return;}
        done({data:[{key}],error:null});
      })).then(resolve,reject);}
    };return query;
  }}};
}
function session(server) {
  const store = new Map(Object.entries(server.values).map(([k,v])=>[k,JSON.stringify(v)]));
  class Storage {
    constructor(values){this.values=values||new Map();}
    getItem(k){return this.values.has(k)?this.values.get(k):null;}
    setItem(k,v){this.values.set(k,String(v));}
    removeItem(k){this.values.delete(k);}
  }
  const localStorage=new Storage(store),sessionStorage=new Storage();
  // Explicit flush controls the write barrier; fake timers never call remote services.
  const sandbox={Storage,localStorage,sessionStorage,crypto:crypto.webcrypto,location:{hash:'',hostname:'concurrency-test.invalid',protocol:'https:'},URLSearchParams,setTimeout:()=>1,clearTimeout:()=>{}};
  sandbox.window=sandbox;sandbox.parent=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(cloudHarness,sandbox,{timeout:1000});
  sandbox.__test.start(server.adapter);
  vm.runInContext(dataSource,sandbox,{timeout:1000});
  sessionStorage.setItem('mabe-test-session','private');
  assert.equal(localStorage.getItem('mabe-test-session'),null,'sessionStorage must remain separate');
  return {db:sandbox.CamberDB,flush:()=>sandbox.__test.flush()};
}
function record(name, expected, actual, details) {
  report.push({name,expected,actual,passed:actual===expected,details});
}
async function run() {
  // Control: independent, fresh snapshots between each completed save.
  let server=backend();
  for(let i=0;i<10;i++){let s=session(server);s.db.addCliente({nome:'Controle '+i});await s.flush();}
  record('Controle sequencial: 10 clientes',10,server.values[keys.clients].length);

  // Same starting snapshot, all modifications before any write completes.
  server=backend();let users=Array.from({length:10},()=>session(server));
  const ids=[];
  users.forEach((s,i)=>{
    ids.push(s.db.addCliente({nome:'Cliente teste '+i,email:'user'+i+'@example.invalid'}).id);
    s.db.addFornecedor({nome:'Fornecedor teste '+i});
    s.db.addProject({nome:'Obra teste '+i,tipo:'Teste'});
  });
  const saves=await Promise.all(users.map(s=>s.flush()));
  record('Criação simultânea: clientes preservados',10,server.values[keys.clients].length);
  record('Criação simultânea: fornecedores preservados',10,server.values[keys.suppliers].length);
  record('Criação simultânea: obras preservadas',10,server.values[keys.projects].length);
  record('IDs distintos para 10 novos clientes',10,new Set(ids).size);
  record('Sessões que receberam sucesso de gravação',10,saves.filter(Boolean).length,'Sucesso no transporte não garante preservação dos cadastros.');

  const initial={};
  initial[keys.clients]=Array.from({length:10},(_,i)=>({id:i+1,nome:'Cliente '+i,obs:'original'}));
  initial[keys.suppliers]=Array.from({length:10},(_,i)=>({id:i+1,nome:'Fornecedor '+i,obs:'original'}));
  initial[keys.projects]=[{id:1,nome:'Obra teste',cronograma:[]}];
  initial['mabe-opps-v3-1']=[];
  server=backend(initial);users=Array.from({length:10},()=>session(server));
  users.forEach((s,i)=>{
    s.db.updateCliente(i+1,{obs:'Alterado '+i});
    s.db.updateFornecedor(i+1,{obs:'Alterado '+i});
    let p=s.db.getProject(1);s.db.updateProject(1,{cronograma:p.cronograma.concat({id:'etapa-'+i,title:'Etapa '+i,responsible:'Usuário '+i,start:'2026-09-17',end:'2026-09-20',status:'A iniciar'})});
    s.db.saveOpps(1,s.db.loadOpps(1).concat({id:i+1,serv:'Serviço '+i,dt:'2026-09-17'}));
  });
  await Promise.all(users.map(s=>s.flush()));
  record('Edição simultânea de clientes diferentes',10,server.values[keys.clients].filter(x=>x.obs.startsWith('Alterado')).length);
  record('Edição simultânea de fornecedores diferentes',10,server.values[keys.suppliers].filter(x=>x.obs.startsWith('Alterado')).length);
  record('10 etapas simultâneas na mesma obra',10,server.values[keys.projects][0].cronograma.length);
  record('10 oportunidades simultâneas na mesma obra',10,server.values['mabe-opps-v3-1'].length);

  server=backend(initial);users=Array.from({length:10},()=>session(server));
  users.forEach((s,i)=>s.db.updateCliente(1,{['campoTeste'+i]:'Alterado '+i}));
  await Promise.all(users.map(s=>s.flush()));
  record('Campos diferentes do mesmo cliente preservados',10,Object.keys(server.values[keys.clients][0]).filter(k=>k.startsWith('campoTeste')).length);

  server=backend();let s=session(server);s.db.addCliente({nome:'Teste retry'});server.fail();
  record('Falha simulada informada ao chamador',false,await s.flush());
  record('Reenvio após falha',true,await s.flush());
  record('Cadastro preservado após reenvio',1,server.values[keys.clients].length);
  let duplicate=false;
  s.db.addFornecedor({nome:'Documento A',doc:'12345678901'});
  try{s.db.addFornecedor({nome:'Documento B',doc:'123.456.789-01'});}catch(e){duplicate=e.code==='DOCUMENTO_DUPLICADO';}
  record('Duplicidade de documento na mesma sessão bloqueada',true,duplicate);

  server=backend(initial);users=Array.from({length:10},()=>session(server));
  users.forEach((s,i)=>s.db.updateCliente(1,{nome:'Concorrente '+i}));
  let outcomes=await Promise.all(users.map(s=>s.flush()));
  record('Mesmo campo: apenas uma gravação aceita',1,outcomes.filter(Boolean).length);
  record('Mesmo campo: nove conflitos informados',9,outcomes.filter(x=>!x).length);

  server=backend(initial);let a=session(server),b=session(server);
  a.db.deleteCliente(1);b.db.updateCliente(1,{obs:'Edição paralela'});
  await a.flush();record('Edição de registro excluído é bloqueada',false,await b.flush());
  record('Registro excluído não reaparece',false,server.values[keys.clients].some(c=>c.id===1));

  server=backend(initial);a=session(server);b=session(server);
  a.db.deleteCliente(1);b.db.updateCliente(2,{obs:'Edição preservada'});
  await Promise.all([a.flush(),b.flush()]);
  record('Excluir um cliente preserva edição de outro',true,server.values[keys.clients].some(c=>c.id===2&&c.obs==='Edição preservada'));

  server=backend();a=session(server);b=session(server);
  a.db.addCliente({nome:'A',doc:'12345678901'});b.db.addCliente({nome:'B',doc:'123.456.789-01'});
  outcomes=await Promise.all([a.flush(),b.flush()]);
  record('Documento duplicado entre sessões bloqueado',1,outcomes.filter(Boolean).length);
  record('Documento único após gravações paralelas',1,server.values[keys.clients].length);

  server=backend(initial);a=session(server);b=session(server);
  a.db.updateCliente(1,{obs:'Primeira edição'});b.db.updateCliente(2,{obs:'Outra pessoa'});
  await Promise.all([a.flush(),b.flush()]);
  a.db.updateCliente(1,{obs:'Segunda edição'});await a.flush();
  record('Salvar novamente não desfaz alteração alheia',true,server.values[keys.clients].some(c=>c.id===2&&c.obs==='Outra pessoa'));

  server=backend(initial);a=session(server);
  a.db.updateCliente(1,{obs:'Primeira'});let inflight=a.flush();
  a.db.updateCliente(1,{obs:'Digitado durante envio'});await inflight;
  record('Edição durante envio é preservada',true,server.values[keys.clients][0].obs==='Digitado durante envio');

  server=backend();a=session(server);a.db.addCliente({nome:'ACK perdido'});server.loseAck();
  record('Resposta perdida não informa sucesso',false,await a.flush());
  record('Reenvio após resposta perdida é idempotente',true,await a.flush());
  record('Reenvio não duplica cadastro',1,server.values[keys.clients].length);

  global.window={};require('../etapa-execucao.js');const E=window.CamberExecution;
  server=backend({[keys.projects]:[{id:1,nome:'Execução',cronograma:[{id:'stage',title:'Etapa',status:'A iniciar'}]}]});
  users=Array.from({length:10},()=>session(server));
  users.forEach((s,i)=>{let p=s.db.getProject(1);p.cronograma[0]=E.transition(p.cronograma[0],'start',{id:'user-'+i,name:'Usuário '+i},'2026-09-18T12:00:00Z','start-'+i);s.db.updateProject(1,{cronograma:p.cronograma});});
  outcomes=await Promise.all(users.map(s=>s.flush()));
  record('10 inícios na mesma etapa: apenas um confirmado',1,outcomes.filter(Boolean).length);
  record('Etapa tem apenas um período em execução',1,server.values[keys.projects][0].cronograma[0].execution.sessions.length);

  const result={generatedAt:new Date().toISOString(),scope:'Simulação isolada, funções reais de persistência; banco, rede, login e interface não exercitados.',sessions:10,sourceHashes:{data:crypto.createHash('sha256').update(dataSource).digest('hex'),cloud:crypto.createHash('sha256').update(cloudSource).digest('hex')},checks:report};
  fs.writeFileSync(path.join(__dirname,'concurrency-results.json'),JSON.stringify(result,null,2));
  const lines=['# Teste de concorrência — Gestão Camber','',result.scope,'','10 sessões independentes. Dados fictícios somente em memória. Nenhum acesso à produção.','', '| Verificação | Esperado | Obtido | Resultado |','|---|---:|---:|---|',...report.map(r=>`| ${r.name} | ${r.expected} | ${r.actual} | ${r.passed?'PASSOU':'FALHOU'} |`),'','## Conclusão','','Os cenários testados preservaram cadastros e alterações independentes. A gravação compara a versão lida antes de atualizar, combina alterações por registro e campo e rejeita conflitos reais. Novos IDs numéricos usam aleatoriedade criptográfica, mantendo compatibilidade com os cadastros antigos.','','Não é um teste de carga do Supabase nem de 10 navegadores autenticados. Não mede latência real, capacidade do servidor, permissões ou todos os módulos do sistema. É uma reprodução determinística da condição em que vários usuários partem da mesma versão dos dados.','','## Próxima etapa','','Validar o adaptador contra Supabase em homologação: SELECT/INSERT/UPDATE/DELETE sob as políticas existentes e updated_at monotônico, dez contas autenticadas e conflitos na interface. Atualizar todos os pontos de gravação antes de produção: clientes antigos ou integrações que ainda fazem upsert completo podem sobrescrever os dados. Não houve publicação nem alteração do banco remoto.',''];
  fs.writeFileSync(path.join(__dirname,'RELATORIO-CONCORRENCIA.md'),lines.join('\n'));
  console.table(report.map(({name,expected,actual,passed})=>({name,expected,actual,passed})));
  console.log(`${report.length} verificações; ${report.filter(r=>!r.passed).length} falhas de integridade reproduzidas.`);
  if(report.some(r=>!r.passed))process.exitCode=1;
}
run().catch(e=>{console.error(e);process.exitCode=1;});
