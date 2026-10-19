/* Safi Nourish — Cloudflare Pages payment gateway, live-ready but FAIL-CLOSED.
 * This file MUST be in the website root; the old /functions folder is ignored
 * by Pages Advanced Mode. All prices and payment statuses are server-verified.
 * REQUIRED settings to take real money: PAYMENT_MODE=live,
 * PAYMENTS_ENABLED=true, PAYSTACK_SECRET_KEY secret sk_live_..., ORDER_DB D1
 * binding (the order table is created automatically), and Paystack live webhook registered.
 * NEW LIVE CHARGES cannot begin until explicitly enabled and fully configured.
 * Existing-order confirmation continues if checkout is switched off.
 */
const SITE_ORIGIN = 'https://safi-nourish-co.pages.dev';
const VERSION = 'safi-checkout-2026-10-live-v1';
const PRICES = Object.freeze({
  'beef-glass-1000': 850, 'beef-glass-500': 450,
  'beef-plastic-1000': 750, 'beef-plastic-500': 350,
  'sheep-glass-1000': 1150, 'sheep-glass-500': 600,
  'sheep-plastic-1000': 950, 'sheep-plastic-500': 500,
  'beef-bulk-10000': 7000, 'sheep-bulk-10000': 9000
});
const HDR = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const reply = (data, status=200) => new Response(JSON.stringify(data), {status, headers:HDR});
const refValid = s => typeof s === 'string' && /^SAFI-[A-Za-z0-9-]{16,100}$/.test(s);
const allowedMode = env => env?.PAYMENT_MODE === 'live' ? 'live' : env?.PAYMENT_MODE === 'test' ? 'test' : null;
const secretMatches = (env, mode) => typeof env?.PAYSTACK_SECRET_KEY === 'string' && env.PAYSTACK_SECRET_KEY.startsWith(mode === 'live' ? 'sk_live_' : 'sk_test_') && env.PAYSTACK_SECRET_KEY.length > 15;
const database = env => env?.ORDER_DB && typeof env.ORDER_DB.prepare === 'function';
// Keep verification and signed webhook processing available even if new checkout
// is paused; customers may have already completed a payment before the pause.
async function setup(env, requireNewPayments=false) {
  const mode=allowedMode(env);
  if(!mode || (requireNewPayments && env?.PAYMENTS_ENABLED !== 'true') || !secretMatches(env,mode) || !database(env)) return {ready:false,mode:mode||'disabled'};
  try {
    // Self-initializing schema so the business owner never has to paste SQL.
    await env.ORDER_DB.prepare(`CREATE TABLE IF NOT EXISTS orders (
      reference TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      items_json TEXT NOT NULL,
      amount_subunits INTEGER NOT NULL CHECK(amount_subunits > 0),
      currency TEXT NOT NULL CHECK(currency = 'KES'),
      environment TEXT NOT NULL CHECK(environment IN ('test','live')),
      status TEXT NOT NULL CHECK(status IN ('created','awaiting_payment','init_failed','paid','failed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      paid_at TEXT
    )`).run();
    await env.ORDER_DB.prepare('SELECT reference FROM orders LIMIT 1').first();
  } catch(_) { return {ready:false,mode}; }
  return {ready:true,mode};
}
// Readiness can initialize/check the order table without accepting payments.
// Never return credential contents or customer data to the browser.
async function readiness(env) {
  const mode=allowedMode(env);
  const liveMode=mode==='live';
  const liveKey=secretMatches(env,'live');
  let storage=false;
  if(database(env)) {
    try {
      await env.ORDER_DB.prepare(`CREATE TABLE IF NOT EXISTS orders (
        reference TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        items_json TEXT NOT NULL,
        amount_subunits INTEGER NOT NULL CHECK(amount_subunits > 0),
        currency TEXT NOT NULL CHECK(currency = 'KES'),
        environment TEXT NOT NULL CHECK(environment IN ('test','live')),
        status TEXT NOT NULL CHECK(status IN ('created','awaiting_payment','init_failed','paid','failed')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        paid_at TEXT
      )`).run();
      await env.ORDER_DB.prepare('SELECT reference FROM orders LIMIT 1').first();
      storage=true;
    } catch (_) {}
  }
  return reply({
    ready_to_enable: liveMode && liveKey && storage,
    payments_enabled: env?.PAYMENTS_ENABLED==='true',
    checks: { live_mode:liveMode, live_key_present:liveKey, order_database:storage }
  });
}
function getCart(input) {
  const email=typeof input?.email==='string'?input.email.trim():'';
  if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Please enter a valid email.');
  if(!Array.isArray(input?.items) || input.items.length<1 || input.items.length>10) throw Error('Invalid shopping cart.');
  const items=[];const seen=new Set();let total=0;
  for(const item of input.items) {
    if(!item || typeof item.sku!=='string' || !Object.hasOwn(PRICES,item.sku) || seen.has(item.sku) || !Number.isInteger(item.qty) || item.qty<1 || item.qty>20) throw Error('Invalid cart product or quantity.');
    seen.add(item.sku);total+=PRICES[item.sku]*item.qty;items.push({sku:item.sku,qty:item.qty,unit_kes:PRICES[item.sku]});
  }
  if(total<1 || total>250000) throw Error('Cart total exceeds the checkout limit.');
  return {email,items,amount:total*100,totalKes:total};
}
async function paystackJson(url,env,options={}) {
  const res=await fetch(url,{...options,headers:{'authorization':`Bearer ${env.PAYSTACK_SECRET_KEY}`, ...(options.headers||{})}});
  let data;try{data=await res.json();}catch(_){throw Error('Paystack returned an unexpected response.');}
  if(!res.ok || data?.status!==true || !data.data)throw Error('Paystack could not process the request.');
  return data.data;
}
async function initialize(request,env) {
  const config=await setup(env,true);
  if(!config.ready) return reply({error:'Online checkout is temporarily unavailable. Please contact Safi Nourish.'},503);
  if(request.headers.get('origin') !== SITE_ORIGIN) return reply({error:'Invalid checkout origin.'},403);
  if(!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return reply({error:'Invalid request type.'},415);
  if(Number(request.headers.get('content-length')||0)>8192)return reply({error:'Request is too large.'},413);
  let input;try{const raw=await request.text();if(raw.length>8192)throw Error();input=JSON.parse(raw);}catch(_){return reply({error:'Invalid checkout request.'},400);}
  if(input?.delivery_agreed!==true)return reply({error:'Please confirm you understand delivery is charged separately.'},400);
  let order;try{order=getCart(input);}catch(e){return reply({error:e.message},400);}
  const reference='SAFI-'+crypto.randomUUID();
  try {
    // Record purchase BEFORE Paystack initializes to prevent untracked charges.
    await env.ORDER_DB.prepare('INSERT INTO orders (reference,email,items_json,amount_subunits,currency,environment,status) VALUES (?,?,?,?,?,?,?)')
      .bind(reference,order.email,JSON.stringify(order.items),order.amount,'KES',config.mode,'created').run();
  }catch(_){return reply({error:'Order recording is unavailable. No payment was started. Please try later.'},503);}
  const metadata={shop:'Safi Nourish',integration:VERSION,order_reference:reference,delivery_included:false};
  let transaction;
  try{
    transaction=await paystackJson('https://api.paystack.co/transaction/initialize',env,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
        email:order.email,amount:order.amount,currency:'KES',channels:['mobile_money'],
        reference,callback_url:SITE_ORIGIN+'/payment-status.html',metadata
      })
    });
    const destination=new URL(transaction.authorization_url);
    if(transaction.reference!==reference || destination.protocol!=='https:' || destination.hostname!=='checkout.paystack.com')throw Error('Payment destination mismatch.');
    await env.ORDER_DB.prepare("UPDATE orders SET status='awaiting_payment',updated_at=CURRENT_TIMESTAMP WHERE reference=? AND status='created'").bind(reference).run();
    return reply({checkout_url:destination.href,reference,subtotal_kes:order.totalKes,mode:config.mode});
  }catch(_){
    // An initialization error does not imply a charge; keep the order record for audit.
    try{await env.ORDER_DB.prepare("UPDATE orders SET status='init_failed',updated_at=CURRENT_TIMESTAMP WHERE reference=? AND status='created'").bind(reference).run();}catch(_){}
    return reply({error:'Could not start payment. Please try again. No order has been confirmed.'},502);
  }
}
async function checkedOrder(reference,env,mode) {
  const order=await env.ORDER_DB.prepare('SELECT reference,email,items_json,amount_subunits,currency,environment,status FROM orders WHERE reference=?').bind(reference).first();
  if(!order || order.environment!==mode || order.currency!=='KES') return {error:'Order reference not found.'};
  const tx=await paystackJson('https://api.paystack.co/transaction/verify/'+encodeURIComponent(reference),env);
  if(tx.reference!==reference || tx.currency!=='KES' || tx.domain!==mode || tx.amount!==order.amount_subunits || tx.channel!=='mobile_money')return {error:'Payment details do not match the order. Please contact Safi Nourish.'};
  // Metadata is secondary corroboration; the original D1 record is authoritative.
  let meta=tx.metadata;if(typeof meta==='string'){try{meta=JSON.parse(meta);}catch(_){meta=null;}}
  if(meta?.shop!=='Safi Nourish' || meta?.integration!==VERSION || meta?.order_reference!==reference)return {error:'Payment order identity does not match.'};
  if(tx.status==='success'){
    await env.ORDER_DB.prepare("UPDATE orders SET status='paid',paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE reference=? AND status!='paid'").bind(reference).run();
    return {status:'success',subtotal_kes:order.amount_subunits/100};
  }
  if(['abandoned','failed'].includes(tx.status)){
    await env.ORDER_DB.prepare("UPDATE orders SET status='failed',updated_at=CURRENT_TIMESTAMP WHERE reference=? AND status NOT IN ('paid')").bind(reference).run();
    return {status:'failed',subtotal_kes:order.amount_subunits/100};
  }
  return {status:'pending',subtotal_kes:order.amount_subunits/100};
}
async function verify(request,env) {
  const config=await setup(env);
  if(!config.ready)return reply({error:'Payment verification is temporarily unavailable.'},503);
  const reference=new URL(request.url).searchParams.get('reference');
  if(!refValid(reference))return reply({error:'Invalid payment reference.'},400);
  try {
    const result=await checkedOrder(reference,env,config.mode);
    if(result.error)return reply({error:result.error},result.error==='Order reference not found.'?404:409);
    return reply({...result,reference,mode:config.mode,delivery_included:false});
  }catch(_){return reply({error:'Payment verification is temporarily unavailable. Please check again or contact Safi Nourish.'},503);}
}
async function validSignature(raw,hex,secret) {
  if(!/^[0-9a-f]{128}$/i.test(hex||''))return false;
  const enc=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-512'},false,['sign']);
  const sig=new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(raw)));
  const their=Uint8Array.from(hex.match(/../g),p=>parseInt(p,16));
  let diff=0;for(let i=0;i<sig.length;i++)diff|=(sig[i]^their[i]);
  return diff===0;
}
async function webhook(request,env) {
  const config=await setup(env);
  if(!config.ready)return reply({error:'Webhook is not configured.'},503);
  if(Number(request.headers.get('content-length')||0)>300000)return reply({error:'Payload too large.'},413);
  let raw;try{raw=await request.text();if(raw.length>300000)return reply({error:'Payload too large.'},413);}catch(_){return reply({error:'Invalid payload.'},400);}
  const signed=await validSignature(raw,request.headers.get('x-paystack-signature'),env.PAYSTACK_SECRET_KEY);
  if(!signed)return reply({error:'Invalid webhook signature.'},401);
  let event;try{event=JSON.parse(raw);}catch(_){return reply({error:'Invalid payload.'},400);}
  if(event?.event!=='charge.success')return reply({received:true});
  const reference=event?.data?.reference;
  if(!refValid(reference))return reply({received:true}); // may be another integration using this Paystack account
  try{
    const result=await checkedOrder(reference,env,config.mode);
    if(result.error==='Order reference not found.')return reply({received:true});
    if(result.error)return reply({error:'Order verification mismatch.'},409);
    if(result.status!=='success')return reply({error:'Payment not confirmed yet.'},503);
    return reply({received:true});
  }catch(_){return reply({error:'Temporary webhook verification issue.'},503);}
}

// Safi Nourish staff orders API. Keeps payment state strictly read-only.
const ADMIN_HDR={'content-type':'application/json; charset=utf-8','cache-control':'no-store, private','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY'};
const adminReply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:ADMIN_HDR});
async function adminAuthorized(request,env){
 const expected=env?.SAFI_ADMIN_KEY;
 if(typeof expected!=='string'||expected.length<40)return false;
 const supplied=request.headers.get('authorization')||'';
 if(!supplied.startsWith('Bearer '))return false;
 const got=supplied.slice(7);
 const a=new TextEncoder().encode(expected),b=new TextEncoder().encode(got);
 if(a.length!==b.length)return false;
 let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];return mismatch===0;
}
async function adminDb(env){
 if(!database(env))throw Error('Order database unavailable');
 await env.ORDER_DB.prepare(`CREATE TABLE IF NOT EXISTS order_fulfilment (
   reference TEXT PRIMARY KEY,
   fulfilment_status TEXT NOT NULL DEFAULT 'not_started' CHECK(fulfilment_status IN ('not_started','preparing','dispatched','delivered','cancelled')),
   delivery_note TEXT NOT NULL DEFAULT '',
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 )`).run();
}
async function adminOrders(request,env){
 if(!await adminAuthorized(request,env))return adminReply({error:'Not authorized. Check your admin key.'},401);
 try{
  await adminDb(env);
  if(request.method==='GET'){
    const url=new URL(request.url);
    const requested=url.searchParams.get('status')||'all';
    const allowed=['all','paid','awaiting_payment','failed','created','init_failed'];
    if(!allowed.includes(requested))return adminReply({error:'Invalid filter.'},400);
    const sql=`SELECT o.reference,o.email,o.items_json,o.amount_subunits,o.currency,o.environment,o.status,o.created_at,o.updated_at,o.paid_at,
      COALESCE(f.fulfilment_status,'not_started') AS fulfilment_status, COALESCE(f.delivery_note,'') AS delivery_note
      FROM orders o LEFT JOIN order_fulfilment f ON o.reference=f.reference
      ${requested==='all'?'':'WHERE o.status=?'} ORDER BY o.created_at DESC LIMIT 200`;
    const q=env.ORDER_DB.prepare(sql);
    const rows=await (requested==='all'?q:q.bind(requested)).all();
    return adminReply({orders:(rows.results||[]).map(row=>{let items=[];try{items=JSON.parse(row.items_json);}catch(_){}delete row.items_json;return {...row,items,amount_kes:row.amount_subunits/100};}),limit:200});
  }
  if(request.method==='POST'){
    if(!(request.headers.get('content-type')||'').startsWith('application/json'))return adminReply({error:'JSON required.'},415);
    const raw=await request.text();if(raw.length>6000)return adminReply({error:'Request too long.'},413);
    let body;try{body=JSON.parse(raw);}catch(_){return adminReply({error:'Invalid JSON.'},400);}
    if(!refValid(body?.reference))return adminReply({error:'Invalid reference.'},400);
    const states=['not_started','preparing','dispatched','delivered','cancelled'];
    if(!states.includes(body?.fulfilment_status))return adminReply({error:'Invalid delivery status.'},400);
    const note=typeof body?.delivery_note==='string'?body.delivery_note.trim():'';
    if(note.length>1000)return adminReply({error:'Delivery note too long.'},400);
    const order=await env.ORDER_DB.prepare('SELECT status FROM orders WHERE reference=?').bind(body.reference).first();
    if(!order)return adminReply({error:'Order not found.'},404);
    if(order.status!=='paid' && body.fulfilment_status!=='not_started')return adminReply({error:'Only verified paid orders can move through delivery stages.'},409);
    await env.ORDER_DB.prepare(`INSERT INTO order_fulfilment (reference,fulfilment_status,delivery_note,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(reference) DO UPDATE SET fulfilment_status=excluded.fulfilment_status, delivery_note=excluded.delivery_note,updated_at=CURRENT_TIMESTAMP`)
      .bind(body.reference,body.fulfilment_status,note).run();
    return adminReply({saved:true,reference:body.reference});
  }
  return adminReply({error:'Method not supported.'},405);
 }catch(_){return adminReply({error:'Admin database request failed.'},503);}
}

export default {
  async fetch(request,env) {
    const path=new URL(request.url).pathname;
    if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
    // Safety: no checkout on Cloudflare preview deployment or alternate domain.
    if(new URL(request.url).origin!==SITE_ORIGIN)return reply({error:'Unknown payment endpoint.'},404);
    if(path==='/api/admin/orders')return adminOrders(request,env);
    if(path==='/api/readiness' && request.method==='GET')return readiness(env);
    if(path==='/api/confirmation-readiness' && request.method==='GET'){
      const config=await setup(env);
      return reply({confirmations_ready:config.ready,new_payments_enabled:env?.PAYMENTS_ENABLED==='true',environment:config.ready?config.mode:'unavailable'});
    }
    if(path==='/api/checkout-config' && request.method==='GET'){
      const s=await setup(env,true);return reply({enabled:s.ready,mode:s.ready?s.mode:'disabled'});
    }
    if(path==='/api/initialize-payment' && request.method==='POST')return initialize(request,env);
    if(path==='/api/verify-payment' && request.method==='GET')return verify(request,env);
    if(path==='/api/paystack-webhook' && request.method==='POST')return webhook(request,env);
    return reply({error:'Unknown payment endpoint.'},404);
  }
};
