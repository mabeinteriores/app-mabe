export const paymentTypes = [
 ['unspecified','Não informado'],
 ['cash','À vista (Pix, boleto ou transferência)'],
 ['deposit_installments','Entrada + parcelas'],
 ['deposit_delivery','Entrada + saldo na entrega'],
 ['card','Cartão de crédito']
];
export const deposits = [10,20,30,40,50,60,70,80,90];
export const installments = [1,2,3,4,5,6,7,8,9,10,11,12,18,24];
export function normalizePayment(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||!paymentTypes.some(([type])=>type===value.type))throw Error('Selecione uma condição de pagamento válida.');
 const terms={type:value.type};
 if(value.type.startsWith('deposit_')){
  terms.depositPercent=Number(value.depositPercent);
  if(!deposits.includes(terms.depositPercent))throw Error('Selecione o percentual de entrada.');
 }
 if(['deposit_installments','card'].includes(value.type)){
  terms.installments=Number(value.installments);
  if(!installments.includes(terms.installments))throw Error('Selecione a quantidade de parcelas.');
 }
 return terms;
}
export function paymentLabel(value){
 const p=normalizePayment(value);
 switch(p.type){
  case 'cash':return 'À vista (Pix, boleto ou transferência)';
  case 'deposit_installments':return `${p.depositPercent}% de entrada + saldo de ${100-p.depositPercent}% em ${p.installments} parcela${p.installments===1?'':'s'} mensa${p.installments===1?'l':'is'}`;
  case 'deposit_delivery':return `${p.depositPercent}% de entrada + ${100-p.depositPercent}% na entrega`;
  case 'card':return `${p.installments}x no cartão de crédito`;
  default:return '';
 }
}
