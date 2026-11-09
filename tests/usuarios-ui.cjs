const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
async function run(browser,scenario){
 const page=await browser.newPage();
 page.setDefaultTimeout(6000);
 try{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(s=>{
   window.calls=[];window.refreshes=0;
   const me={id:'admin-ficticio',nome:'Admin fictício',papel:s==='denied'?'usuario':'admin',aprovado:true,abas_permitidas:[]};
   const wait=ms=>new Promise(r=>setTimeout(r,ms));
   if(s==='offline')return;
   window.supabase={createClient:()=>({
    auth:{getSession:async()=>{await wait(60);return {data:{session:s==='login'?null:{}}}},
     getUser:async()=>({data:{user:{id:me.id,email:'teste@example.invalid'}}}),
     refreshSession:async()=>{window.refreshes++;return {error:null}}},
    from:()=>{const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,
     maybeSingle:async()=>{await wait(80);return {data:me}},then:(yes,no)=>Promise.resolve({data:[]}).then(yes,no)};
     return q;},
    functions:{invoke:async(name,{body})=>{
     if(!window.__camberProfile?.aprovado||window.__camberProfile.papel!=='admin'||document.getElementById('camberHide'))throw Error('Consulta antes de liberar o acesso');
     if(name!=='aprovar-admin'||body.action!=='list')throw Error('Operação inesperada');
     window.calls.push(body.action);
     if(s==='retry'&&calls.length===1)throw Error('Falha de rede simulada');
     if(s==='expired'&&calls.length===1)return {error:{message:'Non-2xx',context:{status:401}}};
     return {data:{users:[me,{id:'pendente',nome:'Cadastro pendente',aprovado:false}],me:me.id}};
    }}
   })};
  },scenario);
  const site=scenario==='local'?'http://localhost:3017':'https://camber.test';
  await page.route('**/*',r=>{
   const u=new URL(r.request().url());
   if(u.origin!==site)return r.abort();
   if(u.pathname==='/painel.html')return r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><script src="camber-brand.js"></script><div id="app" data-page="painel"></div><script src="shell.js"></script>'});
   const f=path.resolve(root,'.'+u.pathname);
   if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return r.abort();
   return r.fulfill({path:f});
  });
  await page.goto(site+'/painel.html');await page.getByRole('link',{name:'Usuários',exact:true}).click();
  if(['admin','retry','expired'].includes(scenario)){
   if(scenario==='retry')await page.getByRole('button',{name:'Tentar novamente'}).click();
   await page.locator('#uList .u-nome').filter({hasText:'Cadastro pendente'}).waitFor();
   assert.equal(await page.locator('#uList .u-item').count(),2);
   assert.deepEqual(await page.evaluate(()=>calls),Array(scenario==='admin'?1:2).fill('list'));
   assert.equal(await page.evaluate(()=>refreshes),scenario==='expired'?1:0);
   assert.match(await page.locator('#uPendNote').innerText(),/1 cadastro/);
  }else{
   if(scenario==='denied')await page.getByRole('heading',{name:'Sem acesso'}).waitFor();
   if(scenario==='login')await page.locator('#mcLogin').waitFor();
   if(scenario==='local')await page.getByText(/abra o aplicativo online e entre como administrador/).waitFor();
   if(scenario==='offline'){
    await page.getByText('Não foi possível conectar ao serviço de usuários.',{exact:false}).waitFor();
    assert.equal(await page.locator('#camberCloudOv').count(),0);
   }
   assert.deepEqual(await page.evaluate(()=>calls),[]);
  }
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const s of ['admin','retry','expired','denied','login','offline','local'])await run(browser,s);
  console.log('PASS: menu Usuários, administrador, espera pelo login, sessão renovada, erro recuperável, acesso negado, desconexão e modo local.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
