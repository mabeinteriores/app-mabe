const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const site = 'https://camber.test';
const storage = 'https://arquivos.test';
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
const name = 'Projeto Escritório – revisão 2.pdf';
const submitted = {version:1,items:[],subtotal:0,total:3850};

(async () => {
 const browser = await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page = await browser.newPage({viewport:{width:390,height:850},acceptDownloads:true});
  const errors = [];
  page.on('pageerror', e=>errors.push(e.message));
  let state='VIEWED', revision=0, hasFile=true, failDownload=false;
  const accessed=[];
  await page.route('**/*', async route=>{
   const url=new URL(route.request().url());
   if(url.origin===site){
    const file=path.join(root,url.pathname.slice(1));
    if(!fs.existsSync(file))return route.abort();
    return route.fulfill({path:file,contentType:url.pathname.endsWith('.mjs')?'application/javascript':undefined});
   }
   if(url.origin===storage){
    accessed.push(url.pathname);
    return route.fulfill({status:failDownload?403:200,contentType:'application/pdf',
     headers:{'Access-Control-Allow-Origin':site},body:failDownload?'expirado':pdf});
   }
   if(url.pathname==='/functions/v1/camber-quotes'){
    const headers={'Access-Control-Allow-Origin':site,'Access-Control-Allow-Headers':'apikey,content-type'};
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
    const {action,payload}=route.request().postDataJSON();
    assert.equal(payload.token,'fixture');
    if(action==='draft')return route.fulfill({headers,json:{draft_revision:1}});
    if(action==='submit'){state='SUBMITTED';return route.fulfill({headers,json:{response:submitted}});}
    assert.equal(action,'lookup');
    return route.fulfill({headers,json:{status:state,control_state:state==='PAUSED'?state:null,
     project_name:'Obra de teste',supplier_name:'Fornecedor de teste',revision:1,
     expires_at:'2030-01-01',response:state==='SUBMITTED'?submitted:null,
     specification:{title:'Marcenaria',description:'Orçar conforme projeto',items:[{id:'1',title:'Marcenaria',quantity:1,unit:'serviço'}]},
     files:hasFile?[{id:'f1',name,url:storage+'/arquivo-'+(++revision)}]:[]}});
   }
   return route.abort();
  });
  const portal=site+'/responder-proposta.html#token=fixture';
  const open=()=>page.url()===portal?page.reload():page.goto(portal);
  const button=page.getByRole('button',{name:'Baixar '+name,exact:true});
  async function checkDownload(){
   await button.waitFor({state:'visible'});
   const previous=revision;
   const [download]=await Promise.all([page.waitForEvent('download'),button.click()]);
   assert.equal(download.suggestedFilename(),name);
   assert.deepEqual(fs.readFileSync(await download.path()),pdf);
   assert.ok(revision>previous);
   assert.equal(accessed.at(-1),'/arquivo-'+revision);
  }
  await open();
  await checkDownload();
  await page.locator('[name="item0"]').fill('3850');
  failDownload=true;
  await button.click();
  await page.getByText('Não foi possível baixar o arquivo. Tente novamente.').waitFor();
  assert.equal(await page.locator('[name="item0"]').inputValue(),'3850');
  failDownload=false;
  await checkDownload();
  await page.locator('#next').click();
  await page.locator('[name="validity"]').fill('2026-12-01');
  await page.locator('#next').click();
  await page.check('[name="agree"]');
  await page.click('#send');
  await page.getByRole('heading',{name:/Proposta recebida/}).waitFor();
  await checkDownload();
  await open();
  await page.getByRole('heading',{name:/Proposta recebida/}).waitFor();
  await checkDownload();
  hasFile=false;
  const before=accessed.length;
  await button.click();
  await page.getByText('Este arquivo não está mais disponível neste pedido.').waitFor();
  assert.equal(accessed.length,before);
  await open();
  await page.getByText('Nenhum arquivo anexado a este pedido.').waitFor();
  state='PAUSED';hasFile=true;
  await open();
  await page.getByRole('heading',{name:'Cotação pausada'}).waitFor();
  assert.equal(await button.count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: PDF visível antes e após responder, reabertura do mesmo link, download com nome e conteúdo, renovação, falha e nova tentativa preservando valores, arquivo indisponível e pausa.');
 } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
