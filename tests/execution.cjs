const assert=require('node:assert/strict');
global.window={};require('../etapa-execucao.js');const E=window.CamberExecution;
const alice={id:'alice',name:'Ana'},bob={id:'bob',name:'Bruno'};
let stage={id:'stage',title:'Pintura',status:'A iniciar'},count=0;
function ok(actual,expected){assert.deepEqual(actual,expected);count++;}
function throws(fn){assert.throws(fn);count++;}
let first=E.transition(stage,'start',alice,'2026-09-18T12:00:00Z','1');
ok(stage.status,'A iniciar');ok(first.status,'Em andamento');ok(E.active(first).userId,'alice');
ok(E.total(first,Date.parse('2026-09-18T12:30:00Z')),1800000);
throws(()=>E.transition(first,'start',bob,'2026-09-18T12:01:00Z','2'));
throws(()=>E.transition(first,'pause',bob,'2026-09-18T12:01:00Z','2'));
throws(()=>E.transition(first,'pause',alice,'2026-09-18T11:59:00Z','2'));
let paused=E.transition(first,'pause',alice,'2026-09-18T12:30:00Z','2');
ok(paused.status,'Em andamento');ok(E.active(paused),null);ok(E.total(paused,Date.parse('2026-09-18T15:00:00Z')),1800000);
throws(()=>E.transition(paused,'pause',alice,'2026-09-18T12:45:00Z','3'));
let resumed=E.transition(paused,'start',bob,'2026-09-18T13:00:00Z','3');
ok(resumed.execution.sessions.length,2);ok(E.active(resumed).userName,'Bruno');
let restored=JSON.parse(JSON.stringify(resumed));ok(E.total(restored,Date.parse('2026-09-18T13:10:00Z')),2400000);
let done=E.transition(restored,'finish',bob,'2026-09-18T13:20:00Z','4');
ok(done.status,'Concluído');ok(done.execution.completedBy.id,'bob');ok(E.total(done,Date.parse('2026-09-19T12:00:00Z')),3000000);ok(done.execution.events.length,4);
throws(()=>E.transition(done,'start',alice,'2026-09-19T12:00:00Z','5'));
throws(()=>E.transition(stage,'finish',alice,'2026-09-18T12:00:00Z','5'));
throws(()=>E.transition(stage,'start',null,'2026-09-18T12:00:00Z','5'));
ok(E.transition(paused,'finish',alice,'2026-09-18T15:00:00Z','6').execution.sessions.length,1);
ok(E.duration(3661000),'1h 01min 01s');
console.log(count+' verificações de execução aprovadas. Pausas excluídas; 30 min de Ana + 20 min de Bruno = 50 min.');
