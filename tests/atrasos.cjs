const assert=require('node:assert/strict');global.window={};require('../agenda-obras.js');const a=window.CamberAgenda,t=new Date(2026,8,18,0,1);let checks=0;function check(task,n,now=t){assert.equal(a.lateDays(task,now),n);checks++;}
check({end:'2026-09-17',status:'Em andamento'},1);check({end:'2026-09-10',status:'Pausada'},8);check({end:'2026-09-17',status:'Concluído'},0);check({end:'2026-09-18'},0);check({end:'2026-09-19'},0);check({end:''},0);check({end:'2026-02-30'},0);check({end:'2025-12-31'},1,new Date(2026,0,1));check({end:'2024-02-28'},2,new Date(2024,2,1));check({start:'2026-09-17',end:'2026-09-18',status:'A iniciar'},1);
check({start:'2026-09-17',end:'2026-09-18',status:'Em andamento'},0);
check({start:'2026-09-17',end:'2026-09-18',status:'Pausada'},0);
check({start:'2026-09-17',end:'2026-09-18',status:'Concluído'},0);
check({start:'2026-09-18',end:'2026-09-20',status:'A iniciar'},0);
check({start:'2026-09-20',end:'2026-09-21',status:'A iniciar'},0);
assert.match(a.lateLabel({start:'2026-09-17',end:'2026-09-18',status:'A iniciar'},t),/Início atrasado há 1 dia/);
assert.match(a.lateLabel({start:'2026-09-10',end:'2026-09-17',status:'A iniciar'},t),/Prazo final vencido há 1 dia/);
console.log(checks+' casos de datas e 2 mensagens de atraso aprovados');