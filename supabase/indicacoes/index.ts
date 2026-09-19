import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return json({error:'Método não permitido.'},405);
 try{
  const text=await req.text();if(text.length>6000)return json({error:'Solicitação muito grande.'},413);
  const body=JSON.parse(text), action=body.action;
  if(!['read','link','lookup','submit','update','payment','archive'].includes(action))return json({error:'Operação inválida.'},400);
  const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  let actor=null;const payload=body.payload&&typeof body.payload==='object'?body.payload:{};
  if(!['lookup','submit'].includes(action)){
   const jwt=(req.headers.get('authorization')||'').replace(/^Bearer /i,'');
   const {data,error}=await sb.auth.getUser(jwt);if(error||!data.user)return json({error:'Entre novamente no sistema.'},401);actor=data.user.id;
  }else{
   const ip=(req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim();
   const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));
   payload.bucket=Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  const {data,error}=await sb.rpc('camber_referrals_api',{action,payload,actor});
  if(error)return json({error:error.code==='P0001'?error.message:error.code==='42501'?'Acesso não autorizado.':'Não foi possível concluir. Atualize e tente novamente.'},error.code==='42501'?403:400);
  return json(data,data?.error?400:200);
 }catch{return json({error:'Não foi possível processar a solicitação.'},400)}
});
