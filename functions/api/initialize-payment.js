// Cloudflare Pages Function. TEST MODE ONLY. Never paste secrets into source code.
const PRICES = Object.freeze({
  "beef-glass-500":450,"beef-glass-1000":850,"beef-plastic-500":350,"beef-plastic-1000":750,
  "sheep-glass-500":600,"sheep-glass-1000":1150,"sheep-plastic-500":500,"sheep-plastic-1000":950,
  "beef-bulk-10000":7000,"sheep-bulk-10000":9000
});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
export async function onRequestPost({request,env}) {
  const secret=env.PAYSTACK_SECRET_KEY;
  if(!secret?.startsWith('sk_test_')) return json({error:'Test checkout is not configured.'},503);
  try {
    const data=await request.json();
    const email=data?.email;
    if(typeof email!=='string'||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!Array.isArray(data.items)||data.items.length<1||data.items.length>20) return json({error:'Invalid customer or shopping bag.'},400);
    let amount=0; const lines=[];
    for(const item of data.items){
      const key=`${item?.kind}-${item?.pack}-${item?.size}`;
      if(!Object.hasOwn(PRICES,key)||!Number.isInteger(item.qty)||item.qty<1||item.qty>20) return json({error:'Invalid product or quantity.'},400);
      amount+=PRICES[key]*item.qty;
      lines.push({sku:key,qty:item.qty,unit_price_kes:PRICES[key]});
    }
    if(amount>250000) return json({error:'Order is above test checkout limit.'},400);
    const pay=await fetch('https://api.paystack.co/transaction/initialize',{
      method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},
      body:JSON.stringify({email,currency:'KES',amount:amount*100,channels:['mobile_money'],metadata:{shop:'Safi Nourish',items:lines,delivery_included:false,environment:'test'}})
    });
    const result=await pay.json();
    if(!pay.ok||!result.status||!result.data?.authorization_url) return json({error:'Paystack could not initialize checkout.'},502);
    return json({checkout_url:result.data.authorization_url,reference:result.data.reference,amount_kes:amount});
  }catch{return json({error:'Invalid checkout request.'},400);}
}
