const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const V=require('../convites-validacao.js');
const cliente={doc:'529.982.247-25',tel:'+55 (51) 91234-5678',cep:'90000-001',email:'qa@example.invalid',uf:'rs'};
const fornecedor={...cliente,doc:'12.ABC.345/01DE-35',categorias:['Marcenaria']};
const catalog=['Marcenaria','Pisos'];let n=0;
function test(d,s,expected){assert.equal(V.error(d,s,catalog),expected);n++;}
test(cliente,false,null);test(fornecedor,true,null);test({...fornecedor,doc:'04.252.011/0001-10'},true,null);test({...fornecedor,doc:'12abc34501de35'},false,null);
for(const doc of ['123','111.111.111-11','12345678901','52998224724','5299822472x'])test({...cliente,doc},false,'documento_invalido');
for(const doc of ['52998224725','123','00000000000000','12ABC34501DE34','12ABC34501D!35','04.252.011/0001-11'])test({...fornecedor,doc},true,'cnpj_invalido');
for(const [field,value,err] of [['email','a@','email_invalido'],['email','not-an-email','email_invalido'],['tel','x','telefone_invalido'],['tel','00000000000','telefone_invalido'],['cep','abc','cep_invalido'],['cep','00000-000','cep_invalido'],['uf','XX','uf_invalida']]){test({...cliente,[field]:value},false,err);test({...fornecedor,[field]:value},true,err);}
test({...fornecedor,categorias:['INEXISTENTE']},true,'categoria_invalida');test({...fornecedor,categorias:['Marcenaria','Pisos']},true,null);
for(const f of ['cadastro-cliente.html','cadastro-fornecedor.html','cliente.html','fornecedor.html','clientes.html','fornecedores.html']){
 const html=fs.readFileSync(path.resolve(__dirname,'..',f),'utf8');
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1],{filename:f});
}
console.log(n+' casos aprovados para documento, e-mail, telefone, CEP, UF e catálogo; scripts das seis páginas verificados.');
