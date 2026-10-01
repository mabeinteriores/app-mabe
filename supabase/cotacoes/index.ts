import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {specification,responseFor} from './validation.mjs';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});if(req.method!=='POST')return json({error:'Método inválido.'},405);
 const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 try{
  let body:any,file:File|null=null;
  if(req.headers.get('content-type')?.startsWith('multipart/form-data')){const f=await req.formData();body=JSON.parse(String(f.get('payload')));file=f.get('file') as File;}else{const raw=await req.text();if(raw.length>150000)return json({error:'Pedido muito grande.'},413);body=JSON.parse(raw);}
  const {action}=body;let payload=body.payload||{},actor:string|null=null;
  if(!['lookup','submit','create','list','revoke','upload','files','create_opportunity','add_participants','bundle','versions','quotation_state','draft','revise','decline','disqualify','supplier_upload','dashboard','catalog','detail','new_quotation','negotiate','select_supplier','purchase','purchases','deadline','workflow','reviewed','opportunity_delete_preview','opportunity_delete','remove_supplier'].includes(action))return json({error:'Operação inválida.'},400);
  if(!['lookup','submit','draft','revise','decline','supplier_upload'].includes(action)){const {data,error}=await sb.auth.getUser((req.headers.get('authorization')||'').replace(/^Bearer /i,''));if(error||!data.user)return json({error:'Entre no sistema novamente.'},401);actor=data.user.id;}
  const rpc=async(a:string,p:any)=>{const {data,error}=await sb.rpc('camber_quotes_api',{action:a,payload:p,actor});if(error)throw Error(error.code==='P0001'||error.code==='42501'?error.message:'Não foi possível concluir a operação.');return data;};
  if(action==='opportunity_delete_preview'||action==='opportunity_delete'){const {data,error}=await sb.rpc('camber_opportunity_delete',{action:action==='opportunity_delete_preview'?'preview':'delete',payload,actor});if(error)throw Error(error.code==='P0001'||error.code==='42501'?error.message:'Não foi possível excluir a oportunidade.');return json(data);}
  if(action==='remove_supplier'){const {data,error}=await sb.rpc('camber_remove_supplier',{payload,actor});if(error)throw Error(error.code==='P0001'||error.code==='42501'?error.message:'Não foi possível remover o fornecedor.');return json(data);}
  const withFiles=async(data:any)=>{data.files=await Promise.all((data.files||[]).map(async(f:any)=>{const r=await sb.storage.from('camber-cotacoes').createSignedUrl(f.path,300,{download:f.name});if(r.error)throw Error('Não foi possível acessar os anexos.');return {id:f.id,name:f.name,size:f.size,url:r.data.signedUrl}}));return data;};
  if(['create','create_opportunity','new_quotation'].includes(action)){payload.specification=specification(payload.specification);const date=Date.parse(payload.expiresAt);if(!Number.isFinite(date)||date<=Date.now()||date>Date.now()+90*86400000)throw Error('Validade deve estar entre hoje e 90 dias.');if(!Number.isFinite(Number(payload.estimatedValue||0))||Number(payload.estimatedValue||0)<0||Number(payload.estimatedValue||0)>1e9)throw Error('Estimativa inválida.');return json(await rpc(action,payload));}
  if(action==='lookup')return json(await withFiles(await rpc('lookup',payload)));
  if(action==='submit'){const request=await rpc('lookup',{token:payload.token});if(request.response&&request.status==='SUBMITTED'&&Number(payload.response?.version)===request.response.version)return json({ok:true,response:request.response,responded_at:request.responded_at});return json(await rpc('submit',{token:payload.token,response:responseFor(request.specification,payload.response)}));}
  if(action==='files')return json(await withFiles(await rpc('file_read',payload)));
  if(action==='upload'||action==='supplier_upload'){
   const request=await rpc(action==='upload'?'file_read':'lookup',action==='upload'?{id:payload.id}:{token:payload.token});payload.id=request.id;if(action==='supplier_upload'&&(!file||!file.name.toLowerCase().endsWith('.pdf')))throw Error('Anexe um arquivo PDF.');
   if(!file||!file.size||file.size>25*1024*1024||file.name.length>250||!/\.(pdf|png|jpe?g|dwg|dxf|zip)$/i.test(file.name))throw Error('Use PDF, imagens, DWG, DXF ou ZIP, até 25 MB por arquivo.');
   const id=payload.fileId;if(!/^[0-9a-f-]{36}$/i.test(id||''))throw Error('Arquivo inválido.');const path=payload.id+'/'+id;
   const existing=await sb.from('camber_quote_files').select('request_id,name,size').eq('id',id).maybeSingle();if(existing.data){if(existing.data.request_id!==payload.id||existing.data.name!==file.name||existing.data.size!==file.size)throw Error('Arquivo já utilizado.');return json({ok:true});}
   const uploaded=await sb.storage.from('camber-cotacoes').upload(path,file,{contentType:'application/octet-stream',upsert:false});if(uploaded.error){const existingObject=await sb.storage.from('camber-cotacoes').list(payload.id,{search:id});if(existingObject.error||!existingObject.data.some(o=>o.name===id&&Number(o.metadata?.size)===file.size))throw Error('Falha ao enviar o arquivo. Tente novamente.');}
   try{await rpc(action==='upload'?'file':'supplier_file',{id:payload.id,token:action==='supplier_upload'?payload.token:undefined,fileId:id,name:file.name,size:file.size});}catch(e){await sb.storage.from('camber-cotacoes').remove([path]);throw e}return json({ok:true});
  }
  return json(await rpc(action,payload));
 }catch(e){return json({error:e instanceof Error?e.message:'Falha ao processar a solicitação.'},400)}
});
