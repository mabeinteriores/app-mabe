// Real form handlers, isolated DOM adapter and disposable in-memory data.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../indicacoes-app.html'),'utf8');
const create=source.slice(source.indexOf('let referralBusy=false'),source.indexOf('let editingId = null;'));
const update=source.slice(source.indexOf('async function salvarStatus()'),source.indexOf('// Ao fechar:'));
if(!create.includes('state.indicacoes.push')||!update.includes('ind.status='))throw new Error('Revise os limites dos handlers.');
function session(){
 const fields={},alerts=[],state={nextId:1,corretores:[{id:7,nome:'Corretor Teste',imobId:4}],influenciadores:[],construtoras:[],indicacoes:[]};
 const noop=()=>{};
 const c={state,editingId:1,document:{getElementById:id=>fields[id]||(fields[id]={value:''})},today:()=> '2026-09-18',alert:t=>alerts.push(t),save:noop,closeModal:noop,renderDashboard:noop,renderIndicacoes:noop,renderTrimestre:noop,renderComissoes:noop,abrirPrecificacaoDaIndicacao:noop};
 c.crypto=require('node:crypto').webcrypto;c.window=c;c.parent=c;c.STATUSES=['Novo Lead','Contato Feito','Reunião Agendada','Proposta Enviada','Fechado','Perdido'];c.CamberCloud={client:()=>({auth:{getUser:async()=>({data:{user:{id:'test-user',email:'teste@example.invalid'}}})}}),flush:async()=>{}};
 vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../indicacoes-validacao.js'),'utf8'),c);vm.runInContext(create+'\n'+update,c);
 return {state,c,alerts,fill(values={}){Object.entries({fCorretor:'7',fClienteNome:'Cliente fictício',fClienteTel:'(51) 99999-1234',fValorEstimado:'',fTipoImovel:'Casa',fContexto:'Teste',fObs:'',...values}).forEach(([id,value])=>c.document.getElementById(id).value=value);},set(id,value){c.document.getElementById(id).value=value;}};
}
const results=[];function test(name,expected,actual){results.push({name,expected,actual,passed:expected===actual});}
async function main(){
let s=session();s.fill();await s.c.salvarIndicacao();test('Criar indicação válida',1,s.state.indicacoes.length);test('Vínculo com corretor selecionado',7,s.state.indicacoes[0].corretorId);test('Status inicial Novo Lead','Novo Lead',s.state.indicacoes[0].status);
for(const field of ['fCorretor','fClienteNome','fClienteTel']){s=session();s.fill({[field]:''});await s.c.salvarIndicacao();test('Bloquear campo obrigatório vazio: '+field,0,s.state.indicacoes.length);}
s=session();s.fill();await s.c.salvarIndicacao();s.fill({fClienteTel:'51999991234'});await s.c.salvarIndicacao();test('Impedir duplicidade do mesmo telefone normalizado',1,s.state.indicacoes.length);
s=session();s.fill({fClienteTel:'abc'});await s.c.salvarIndicacao();test('Rejeitar telefone inválido',0,s.state.indicacoes.length);
s=session();s.fill({fCorretor:'99999'});await s.c.salvarIndicacao();test('Rejeitar parceiro inexistente',0,s.state.indicacoes.length);
s=session();s.fill();await s.c.salvarIndicacao();s.c.editingId=s.state.indicacoes[0].id;s.set('sStatus','Contato Feito');s.set('sLog','');await s.c.salvarStatus();test('Histórico de mudança sem observação',2,s.state.indicacoes[0].logs.length);
s.set('sStatus','Reunião Agendada');s.set('sLog','Agendado');await s.c.salvarStatus();const log=s.state.indicacoes[0].logs.at(-1);test('Histórico identifica autor',true,!!(log.userId||log.actorId||log.autor));test('Histórico inclui horário',true,/T\d{2}:\d{2}|\d{2}:\d{2}/.test(log.data));
const users=Array.from({length:10},()=>session());for(const [i,u] of users.entries()){u.fill({fClienteNome:'Teste '+i,fClienteTel:'5190000000'+i});await u.c.salvarIndicacao();}test('IDs únicos em dez sessões independentes',10,new Set(users.map(u=>u.state.indicacoes[0].id)).size);
s=session();s.fill();await Promise.all([s.c.salvarIndicacao(),s.c.salvarIndicacao()]);test('Clique duplo cria somente uma indicação',1,s.state.indicacoes.length);
s=session();s.fill();s.c.CamberCloud.client=()=>({auth:{getUser:async()=>({error:true,data:{user:null}})}});await s.c.salvarIndicacao();test('Sessão expirada não permite salvar',0,s.state.indicacoes.length);
s=session();s.fill();s.c.CamberCloud.flush=async()=>{throw Error('Falha simulada')};await s.c.salvarIndicacao();test('Falha de sincronização avisa usuário',true,s.alerts.includes('Falha simulada'));s.c.CamberCloud.flush=async()=>{};await s.c.salvarIndicacao();test('Repetir após falha não duplica cadastro',1,s.state.indicacoes.length);
s=session();s.fill();await s.c.salvarIndicacao();s.fill({fClienteTel:'+55 (51) 99999-1234'});await s.c.salvarIndicacao();test('Duplicidade com código do país',1,s.state.indicacoes.length);
s=session();s.state.influenciadores.push({id:7,nome:'Outro parceiro'});s.fill();await s.c.salvarIndicacao();test('Parceiro com identificador ambíguo é bloqueado',0,s.state.indicacoes.length);
const report={date:new Date().toISOString(),scope:'Handlers reais com formulário e armazenamento simulados. Sem acessos ou alterações a dados reais. Link fixo não implementado; não foi testado.',results};
fs.writeFileSync(path.join(__dirname,'indicacoes-review-results.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(__dirname,'RELATORIO-INDICACOES.md'),['# Revisão de Indicações','',report.scope,'','| Verificação | Esperado | Obtido | Resultado |','|---|---|---|---|',...results.map(r=>`| ${r.name} | ${r.expected} | ${r.actual} | ${r.passed?'PASSOU':'FALHOU'} |`),'','O fluxo de link fixo por corretor, atribuição no servidor, envio repetido pelo mesmo link, desativação e proteção dos dados internos ainda precisa ser implementado e testado. Os resultados acima não certificam segurança ou capacidade do servidor.'].join('\n'));
console.table(results);console.log(results.filter(r=>r.passed).length+' aprovados; '+results.filter(r=>!r.passed).length+' falhas.');

if(results.some(r=>!r.passed))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
