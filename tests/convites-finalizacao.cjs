const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=f=>fs.readFileSync(path.resolve(__dirname,'..',f),'utf8');
(async()=>{for(const tipo of ['cliente','fornecedor']){
 const text=read(tipo+'.html'),fn=text.slice(text.indexOf('  async function salvar('),text.indexOf(tipo==='cliente'?'  // excluir cliente':'  function excluirFornec(){'));
 let synced=false,adds=0,updates=0,remote=0,failFinalize=true;
 const chain={update:()=>chain,eq:()=>chain,select:()=>chain,maybeSingle:async()=>{remote++;return failFinalize?{error:Error('simulação de indisponibilidade')}:{data:{status:'cadastrado'}}}};
 const sb={from:()=>chain,rpc:async()=>{remote++;return {error:failFinalize?Error('falha de confirmação'):null}}};
 const ctx={fornecedorCarregado:true,salvandoCliente:false,salvandoFornecedor:false,excluindoCliente:false,convitePronto:false,conviteToken:'fixture',editId:null,location:{href:''},alert:()=>{},val:()=> 'Teste',fval:k=>k==='fPrazoMedio'?'21':'Teste',getCats:()=>['Marcenaria'],getContatos:()=>[],document:{querySelectorAll:()=>[],querySelector:()=>({dataset:{t:'pj'}}),getElementById:()=>({checked:false,value:''})},CamberDB:{},CamberCloud:{flush:async()=>synced,client:()=>sb}};ctx.window=ctx;
 const nome=tipo==='cliente'?'Cliente':'Fornecedor';ctx.CamberDB['add'+nome]=()=>{adds++;return {id:1}};ctx.CamberDB['update'+nome]=()=>{updates++;return {id:1}};
 vm.runInNewContext(fn,ctx);
 await ctx.salvar();assert.equal(adds,0);ctx.convitePronto=true;
 await ctx.salvar();assert.equal(remote,0);assert.equal(ctx.location.href,'');assert.equal(adds,1);
 synced=true;await ctx.salvar();assert.equal(remote,1);assert.equal(ctx.location.href,'');
 failFinalize=false;await Promise.all([ctx.salvar(),ctx.salvar()]);assert.equal(remote,2);assert.equal(adds,1);assert.equal(updates,2);assert.equal(ctx.location.href,tipo==='cliente'?'clientes.html':'fornecedores.html');
}
console.log('PASS: os dois formulários esperam o convite, recusam falha de sincronização, não navegam após erro de conclusão e repetem sem duplicar o registro.');})().catch(e=>{console.error(e);process.exitCode=1});
