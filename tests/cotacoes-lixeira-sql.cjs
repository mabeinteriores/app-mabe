const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path');
const folder=path.resolve(__dirname,'../supabase/cotacoes');
(async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create table auth.users(id uuid primary key);
   create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
   create table profiles(id uuid primary key,nome text,papel text,ativo boolean,aprovado boolean,abas_permitidas text[]);
   create table kv_store(workspace text,key text,value jsonb,updated_by uuid,updated_at timestamptz,primary key(workspace,key));
   insert into auth.users values(gen_random_uuid());
   insert into profiles select id,'Teste','admin',true,true,'{}' from auth.users;
   insert into kv_store(workspace,key,value) values('mabe','mabe-projects-v3','[]');
   grant select on profiles to service_role; grant all on kv_store to service_role;`);
  for(const file of ['schema.sql','module-v2.sql','central.sql','remuneracao.sql','quotation-control.sql','opportunity-delete.sql','purchase-control.sql','test-quotation-control.sql','test-opportunity-delete.sql','test-purchase-control.sql']){
   await db.exec(fs.readFileSync(path.join(folder,file),'utf8'));
  }
  console.log('PASS: lixeira e restauração de cotações e compras, edição de pedidos, propostas preservadas, histórico, permissões, repetição e conflito de versão.');
 } finally { await db.close(); }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
