// Used by the purchase editor and by the server before persisting a revision.
export function purchaseContent(input,delivery){
 const text=(value,max)=>String(value??'').trim().slice(0,max);
 function number(value,max,label){
  const n=Number(value);
  if(value===''||value==null||!Number.isFinite(n)||n<0||n>max||Math.abs(n*100-Math.round(n*100))>0.0001)throw Error('Confira '+label+'.');
  return n;
 }
 const cents=n=>Math.round(n*100)/100;
 const days=value=>{
  if(value==null||value==='')return null;
  const n=Number(value);if(!Number.isInteger(n)||n<1||n>3650)throw Error('Informe um prazo de 1 a 3.650 dias.');
  return n;
 };
 if(!Array.isArray(input?.items)||input.items.length<1||input.items.length>100)throw Error('Informe de 1 a 100 itens no pedido.');
 const items=input.items.map(item=>{
  const title=text(item.title,200),unit=text(item.unit,30),quantity=number(item.quantity,100000,'a quantidade');
  if(!title||!unit||!quantity)throw Error('Preencha descrição, unidade e quantidade de cada item.');
  const unitPrice=number(item.unitPrice,1e9,'o preço unitário');
  return {title,room:text(item.room,100),unit,quantity,unitPrice,value:cents(quantity*unitPrice),days:days(item.days)};
 });
 const subtotal=cents(items.reduce((sum,item)=>sum+item.value,0));
 const freight=number(input.freight??0,1e9,'o frete'),assembly=number(input.assembly??0,1e9,'a montagem');
 const discountPercent=number(input.discountPercent??0,100,'o desconto'),discount=cents(subtotal*discountPercent/100);
 const total=cents(subtotal-discount+freight+assembly);
 if(total<0||total>1e9)throw Error('Confira o total dos itens e encargos.');
 const start=input.start||null,end=input.end||null;
 const validity=input.validity||null;
 for(const date of [delivery,start,end,validity].filter(Boolean)){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('Confira as datas do pedido.');
 }
 if((start&&end&&end<start)||(delivery&&((start&&start<delivery)||(end&&end<delivery))))throw Error('Confira a sequência de entrega, início e fim da montagem.');
 return {items,subtotal,discountPercent,discount,freight,assembly,total,start,end,days:days(input.days),basis:text(input.basis,300),validity,
  scope:text(input.scope,2000),warranty:text(input.warranty,200),exclusions:text(input.exclusions,2000)};
}
