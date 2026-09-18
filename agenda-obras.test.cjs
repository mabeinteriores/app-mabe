const assert=require('node:assert/strict');
global.window={};require('./agenda-obras.js');const a=window.CamberAgenda;
function dates(anchor,view){return a.range(a.day(anchor),view).map(d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'));}
assert.deepEqual(dates('2026-09-20','semana'),['2026-09-14','2026-09-20']);
assert.deepEqual(dates('2026-09-15','quinzena'),['2026-09-01','2026-09-15']);
assert.deepEqual(dates('2026-09-16','quinzena'),['2026-09-16','2026-09-30']);
assert.deepEqual(dates('2024-02-29','mes'),['2024-02-01','2024-02-29']);
assert.deepEqual(dates('2026-12-31','dia'),['2026-12-31','2026-12-31']);
assert.equal(a.day('2026-02-30'),null);
assert.equal(a.span({start:'2026-09-20',end:'2026-09-19'}),null);
assert.equal(a.span({start:'',end:'2026-09-19'}),null);
assert.equal(!!a.overdue({end:'2026-09-17',status:'Em andamento'},a.day('2026-09-17')),false);
assert.equal(!!a.overdue({end:'2026-09-16',status:'Concluído'},a.day('2026-09-17')),false);
assert.equal(!!a.overdue({end:'2026-09-16',status:'Em andamento'},a.day('2026-09-17')),true);
console.log('11 verificações aprovadas: períodos, ano bissexto, datas inválidas e atrasos.');
