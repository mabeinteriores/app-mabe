const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('indicacoes-real.js','utf8');
const fn=source.slice(source.indexOf(' async function moveReferral'),source.indexOf(" app.addEventListener('dragstart'"));
let row,calls,opened,loads,renders,messages,fail;
const error={textContent:''},edit={elements:{status:{value:''}}};
const ctx={busy:false,statuses:['Novo Lead','Contato Feito','Reunião Agendada','Proposta Enviada','Fechado','Perdido'],items:()=>[row],toast:x=>messages.push(x),render:()=>renders++,open:()=>opened++,edit,document:{querySelector:()=>error},mutate:async(a,p)=>{calls.push({a,p});if(fail)throw Error('Conflito de revisão');return true},load:async()=>loads++};
vm.createContext(ctx);vm.runInContext(fn,ctx);
function reset(){row={id:1,status:'Novo Lead',revision:4,ownerId:'u1',nextAction:'Ligar',nextActionDate:'2026-09-22',valorEstimado:20000};calls=[];opened=loads=renders=0;messages=[];fail=false;error.textContent='';ctx.busy=false}
(async()=>{
reset();await ctx.moveReferral(1,'Contato Feito');assert.equal(calls.length,1);assert.equal(calls[0].p.revision,4);assert.equal(calls[0].p.ownerId,'u1');assert.equal(calls[0].p.value,20000);assert.equal(loads,1);
reset();await ctx.moveReferral(1,'Novo Lead');assert.equal(calls.length,0);
reset();await ctx.moveReferral(1,'Inválido');assert.equal(calls.length,0);
reset();ctx.busy=true;await ctx.moveReferral(1,'Perdido');assert.equal(calls.length,0);
reset();row.archived=true;await ctx.moveReferral(1,'Perdido');assert.equal(calls.length,0);
reset();await ctx.moveReferral(1,'Fechado');assert.equal(opened,1);assert.equal(edit.elements.status.value,'Fechado');assert.equal(calls.length,0);
reset();row.nextAction='';await ctx.moveReferral(1,'Contato Feito');assert.equal(opened,1);assert.equal(calls.length,0);
reset();row.paymentStatus='Paga';row.status='Fechado';await ctx.moveReferral(1,'Perdido');assert.equal(calls.length,0);assert.equal(messages.length,1);
reset();fail=true;await ctx.moveReferral(1,'Contato Feito');assert.equal(row.status,'Novo Lead');assert.match(error.textContent,/Conflito/);assert.equal(loads,0);
console.log('PASS: 9 cenários de movimentação, preservação de dados e falhas.');
})().catch(e=>{console.error(e);process.exit(1)});
