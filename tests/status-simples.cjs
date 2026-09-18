const assert=require('node:assert/strict');global.window={};require('../etapa-execucao.js');const E=window.CamberExecution;
const actor={id:'ana',name:'Ana'},time='2026-09-18T14:00:00Z';let count=0;
function check(a,b){assert.deepEqual(a,b);count++;}function rejects(fn){assert.throws(fn);count++;}
let original={id:'etapa',status:'A iniciar',title:'Vistoria'};
let started=E.update(original,'status',{status:'Em andamento'},actor,time,'1');
check(original.status,'A iniciar');check(started.status,'Em andamento');check(E.active(started),null);
rejects(()=>E.update(started,'status',{status:'Pausada',reason:' '},actor,time,'2'));
let paused=E.update(started,'status',{status:'Pausada',reason:'Aguardando material'},actor,time,'2');check(paused.execution.pauseReason,'Aguardando material');
let logged=E.update(paused,'hours',{date:'2026-09-18',minutes:150,note:'Medições no local'},actor,time,'3');
check(logged.status,'Pausada');check(E.total(logged,Date.now()),9000000);check(logged.execution.entries[0].userName,'Ana');
rejects(()=>E.update(logged,'hours',{date:'2026-02-30',minutes:60,note:'Teste'},actor,time,'4'));
rejects(()=>E.update(logged,'hours',{date:'2026-09-18',minutes:0,note:'Teste'},actor,time,'4'));
rejects(()=>E.update(logged,'hours',{date:'2026-09-18',minutes:60,note:''},actor,time,'4'));
rejects(()=>E.update(logged,'hours',{date:'2026-09-18',minutes:1441,note:'Teste'},actor,time,'4'));
let completed=E.update(logged,'status',{status:'Concluído'},actor,time,'4');check(completed.execution.completedBy.name,'Ana');check(completed.execution.events.length,3);check(completed.execution.entries.length,1);
let reopened=E.update(completed,'status',{status:'Em andamento'},actor,time,'5');check(reopened.execution.completedAt,undefined);check(reopened.execution.entries.length,1);
console.log(count+' verificações aprovadas: status, motivo de pausa, 2h30 registradas, histórico e validação.');
