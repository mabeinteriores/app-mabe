const assert=require('node:assert/strict'),{summaryHTML}=require('../cotacoes-kanban.js');
const q={id:'quote1',code:'COT-001',invited:3,received:2,awaiting:1,suppliers:[{id:'a',name:'Fornecedor Alfa',responded:true},{id:'b',name:'Fornecedor Beta',responded:true},{id:'c',name:'Fornecedor Gama',awaiting:true}]};
let html=summaryHTML([q]);assert(html.includes('2 de 3 responderam'));assert(html.includes('1 aguardando'));for(const s of q.suppliers)assert(html.includes(s.name));assert.equal((html.match(/>Respondeu</g)||[]).length,2);assert(html.includes('value="2" max="3"'));assert(html.includes('cotacoes.html?id=quote1'));
const more={...q,suppliers:[...q.suppliers,{name:'Quarto'},{name:'Quinto'}]};html=summaryHTML([more]);assert(html.includes('Ver mais 2 participantes'));assert(html.includes('Quinto'));
html=summaryHTML([{...q,code:'<script>bad()</script>',suppliers:[{name:'<img src=x onerror=bad()>',responded:true}]}]);assert(!html.includes('<script>'));assert(!html.includes('<img'));assert(html.includes('&lt;img'));
assert(summaryHTML([{...q,invited:0,received:0,suppliers:[]}]).includes('value="0" max="1"'));
assert.equal(summaryHTML([]),'');console.log('PASS: participantes por nome, 2/3 respostas, aguardando, progresso, expansão e escape.');
