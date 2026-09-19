(function(){
 'use strict';
 function id(){var n=new Uint32Array(2);crypto.getRandomValues(n);return (n[0]&0x1fffff)*4294967296+n[1]||id();}
 function phone(input){
   var text=String(input||'').trim();if(!/^[+\d\s().-]+$/.test(text))throw new Error('Informe um telefone válido com DDD.');
   var n=text.replace(/\D/g,'');if((n.length===12||n.length===13)&&n.startsWith('55'))n=n.slice(2);
   var ddds='11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' ');
   if(ddds.indexOf(n.slice(0,2))<0||!(/^[1-9]\d[2-5]\d{7}$/.test(n)||/^[1-9]\d9\d{8}$/.test(n))||/^(\d)\1+$/.test(n.slice(2)))throw new Error('Informe um telefone brasileiro válido com DDD.');
   return '+55'+n;
 }
 function partner(state,value){var id=Number(value),matches=[];[['corretores','Corretor'],['influenciadores','Influenciador'],['construtoras','Construtora']].forEach(function(pair){(state[pair[0]]||[]).forEach(function(p){if(p.id===id)matches.push({person:p,type:pair[1]});});});if(matches.length!==1)throw new Error('Parceiro inexistente ou identificação ambígua. Confira o cadastro.');return matches[0];}
 function duplicate(state,number){return state.indicacoes.find(function(r){try{return phone(r.clienteTel)===number;}catch(e){return false;}});}
 async function actor(){
   if(window.location && (location.protocol==='file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)))return {id:'local-test',name:'Teste local (sem login)'};
   var cloud=window.CamberCloud,client=cloud&&cloud.client();if(!client)throw new Error('Entre com seu usuário para salvar indicações.');
   var response=await client.auth.getUser();if(response.error||!response.data.user)throw new Error('Sua sessão expirou. Entre novamente.');
   var user=response.data.user,profile=window.__camberProfile;
   if(!profile&&window.parent!==window){try{profile=window.parent.__camberProfile;}catch(e){}}
   return {id:user.id,name:profile&&profile.nome||user.email||'Usuário'};
 }
 window.ReferralRules={id:id,phone:phone,partner:partner,duplicate:duplicate,actor:actor};
})();
