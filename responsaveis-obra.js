(function(){'use strict';
 function list(users,suppliers){return (users||[]).filter(function(u){return u.id&&u.nome;}).map(function(u){return {key:'usuario:'+u.id,id:u.id,type:'usuario',name:u.nome};}).concat((suppliers||[]).filter(function(f){return f.id&&f.nome&&f.status==='Ativo'&&f.habilitadoObra===true;}).map(function(f){return {key:'terceiro:'+f.id,id:f.id,type:'terceiro',name:f.fantasia||f.nome};}));}
 window.CamberResponsaveisObra={list:list};})();
