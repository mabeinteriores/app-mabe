(function(root){
'use strict';
const messages={
 documento_invalido:'Confira o CPF ou CNPJ, incluindo os dígitos verificadores.',
 cnpj_invalido:'Informe um CNPJ válido, incluindo os dois dígitos verificadores.',
 email_invalido:'Informe um e-mail válido, por exemplo nome@empresa.com.br.',
 telefone_invalido:'Informe o telefone com DDD e 10 ou 11 dígitos. O prefixo +55 é opcional.',
 cep_invalido:'Informe um CEP com oito dígitos.',
 uf_invalida:'Informe a sigla de um estado brasileiro, como RS.',
 categoria_invalida:'Selecione serviços que estejam no catálogo atual. Atualize a lista e tente novamente.'
};
const fields={documento_invalido:'fDoc',cnpj_invalido:'fDoc',email_invalido:'fEmail',telefone_invalido:'fTel',cep_invalido:'fCep',uf_invalida:'fUF'};
const states='AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
function docKey(s){return String(s||'').trim().toUpperCase().replace(/[.\/\s-]/g,'')}
function validDoc(s,supplier){const d=docKey(s),cpf=/^[0-9]{11}$/.test(d);
 if((cpf&&supplier)||(!cpf&&!/^[A-Z0-9]{12}[0-9]{2}$/.test(d))||/^(.)\1+$/.test(d))return false;
 for(let size=d.length-2;size<d.length;size++){let sum=0;
  for(let i=0;i<size;i++)sum+=(d.charCodeAt(i)-48)*(cpf?size+1-i:2+(size-1-i)%8);
  if((sum%11<2?0:11-sum%11)!==Number(d[size]))return false;
 }return true;
}
function error(d,supplier,catalog){if(!validDoc(d.doc,supplier))return supplier?'cnpj_invalido':'documento_invalido';
 const email=String(d.email||'').trim();if(email.length>254||!/^[^\s@]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(email))return 'email_invalido';
 let tel=String(d.tel||'').trim();if(!/^\+?[0-9() \-]+$/.test(tel))return 'telefone_invalido';
 tel=tel.replace(/\D/g,'');if(tel.length>11&&tel.startsWith('55'))tel=tel.slice(2);
 if(!/^[1-9][0-9]{9,10}$/.test(tel)||/^([0-9])\1+$/.test(tel))return 'telefone_invalido';
 const cep=String(d.cep||'').trim();if(!/^[0-9]{5}-?[0-9]{3}$/.test(cep)||cep.replace('-','')==='00000000')return 'cep_invalido';
 if(!states.includes(String(d.uf||'').trim().toUpperCase()))return 'uf_invalida';
 if(supplier&&(!Array.isArray(d.categorias)||!d.categorias.length||!Array.isArray(catalog)||d.categorias.some(x=>!catalog.includes(x))))return 'categoria_invalida';
 return null;
}
const api={docKey,validDoc,error,messages,fields};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CamberConvites=api;
})(typeof window==='object'?window:globalThis);
