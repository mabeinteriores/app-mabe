import {normalizePayment,paymentLabel} from './payment.mjs';
export function specification(value) {
 const text=(v,n)=>{if(typeof v!=='string'||!v.trim()||v.length>n)throw Error('Confira o título, a descrição e os itens.');return v.trim()};
 if(!value||!['standard','custom'].includes(value.mode))throw Error('Tipo de pedido inválido.');
 if(!Array.isArray(value.items)||!value.items.length||value.items.length>100)throw Error('Cadastre de 1 a 100 itens.');
 const seen=new Set();return {mode:value.mode,title:text(value.title,150),description:text(value.description,3000),items:value.items.map((x,i)=>{const quantity=Number(x.quantity);if(!Number.isFinite(quantity)||quantity<=0||quantity>100000)throw Error('Quantidade inválida.');const id=String(x.id||i);if(seen.has(id)||id.length>80)throw Error('Item duplicado.');seen.add(id);return {id,room:String(x.room||'').trim().slice(0,100),title:text(x.title,200),quantity,unit:text(x.unit,30)}})};
}
export function responseFor(spec,data){
 if(!data||!Number.isInteger(Number(data.version))||Number(data.version)<1)throw Error('Versão inválida. Reabra o link.');
 const money=v=>{if(v===''||v===null||v===undefined||!Number.isFinite(Number(v))||Number(v)<0||Number(v)>1e9)throw Error('Confira os valores da proposta.');return Math.round(Number(v)*100)/100};
 const text=(key,max,required=true)=>{const v=String(data[key]||'').trim();if(v.length>max||(required&&!v))throw Error('Preencha '+key+'.');return v};
 const empty=v=>v===null||v===undefined||typeof v==='string'&&!v.trim();
 const date=(key,required=false)=>{const v=text(key,10,required);if(!v)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T12:00:00Z'))||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v)throw Error('Confira as datas.');return v};
 if(data.agree!==true)throw Error('Confirme os valores, prazos e condições.');
 if(!Array.isArray(data.values)||data.values.length!==spec.items.length)throw Error('Preencha todos os itens do pedido.');
 const items=spec.items.map((x,i)=>({...x,unitPrice:money(data.values[i]),value:money(Number(x.quantity)*money(data.values[i])),days:data.itemDays?.[i]?Number(data.itemDays[i]):null}));
 if(items.some(i=>i.days!==null&&(!Number.isInteger(i.days)||i.days<1||i.days>3650)))throw Error('Confira o prazo de cada item.');
 const optionalMoney=v=>money(empty(v)?0:v);
 const freight=optionalMoney(data.freight),assembly=optionalMoney(data.assembly),discountPercent=optionalMoney(data.discountPercent),subtotal=Math.round(items.reduce((s,i)=>s+i.value,0)*100)/100; if(discountPercent>100)throw Error('Desconto deve estar entre 0 e 100%.');const discount=Math.round(subtotal*discountPercent)/100,total=Math.round((subtotal+freight+assembly-discount)*100)/100;
 if(total<=0||total>1e9)throw Error('Total inválido.');
 const days=empty(data.days)?null:Number(data.days);if(days!==null&&(!Number.isInteger(days)||days<1||days>3650))throw Error('Confira o prazo em dias.');
 const delivery=date('delivery'),start=date('start'),end=date('end'),validity=date('validity',true);if(end&&start&&end<start||start&&delivery&&start<delivery||end&&delivery&&end<delivery)throw Error('A montagem deve ocorrer a partir da entrega e terminar após seu início.');
 // Old sent proposals and already-open clients keep their original payment text.
 // New structured selections always produce their description on the server.
 const paymentTerms=data.paymentTerms==null?null:normalizePayment(data.paymentTerms);
 const payment=paymentTerms?paymentLabel(paymentTerms):text('payment',1000,false);
 return {version:Number(data.version),items,subtotal,freight,assembly,discountPercent,discount,total,days,delivery,start,end,validity,payment,paymentTerms,basis:text('basis',300,false),scope:text('scope',2000,false),warranty:text('warranty',200,false),exclusions:text('exclusions',2000,false)};
}
