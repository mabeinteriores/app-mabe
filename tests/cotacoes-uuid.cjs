const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../cotacoes-shared.js'),'utf8');
const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function load(crypto){const context={window:{},crypto};vm.runInNewContext(source,context);return context.window.CamberQuotes.uuid;}
let nativeCalls=0;
const native={randomUUID(){assert.equal(this,native);nativeCalls++;return '00112233-4455-4677-8899-aabbccddeeff';},getRandomValues(){assert.fail('Native UUID should be used when available');}};
assert.match(load(native)(),valid);assert.equal(nativeCalls,1);
for(const randomUUID of [undefined,null,'unavailable']){
 let calls=0;
 const crypto={randomUUID,getRandomValues(bytes){assert.equal(this,crypto);assert.equal(bytes.length,16);calls++;for(let i=0;i<16;i++)bytes[i]=i*17;return bytes;}};
 assert.equal(load(crypto)(),'00112233-4455-4677-8899-aabbccddeeff');assert.equal(calls,1);
}
for(const byte of [0,255]){
 const id=load({getRandomValues(bytes){bytes.fill(byte);return bytes;}})();
 assert.match(id,valid);assert.equal(id[19],byte===0?'8':'b');
}
const fallback=load({getRandomValues:bytes=>webcrypto.getRandomValues(bytes)});
const ids=new Set();
for(let i=0;i<10000;i++){const id=fallback();assert.match(id,valid);ids.add(id);}
assert.equal(ids.size,10000);
assert.match(load(webcrypto)(),valid);
for(const unavailable of [undefined,null,{}, {randomUUID:'unsupported',getRandomValues:null}])assert.throws(load(unavailable),/Abra o aplicativo em um navegador atualizado/);
console.log('PASS: UUID nativo, compatibilidade sem randomUUID, formato v4, 10.000 IDs distintos e erro orientativo sem fonte segura.');
