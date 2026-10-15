/* Cloudflare Pages Function: secure Paystack TEST transaction initialization.
   This endpoint deliberately rejects live keys until fulfilment, webhooks, and delivery are ready. */
const PRICES = Object.freeze({
  'beef-glass-1000': 850, 'beef-glass-500': 450,
  'beef-plastic-1000': 750, 'beef-plastic-500': 350,
  'sheep-glass-1000': 1150, 'sheep-glass-500': 600,
  'sheep-plastic-1000': 950, 'sheep-plastic-500': 500,
  'beef-bulk-10000': 7000, 'sheep-bulk-10000': 9000
});
const reply = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
export async function onRequestPost({ request, env }) {
  const secret = env.PAYSTACK_SECRET_KEY;
  if (typeof secret !== 'string' || !secret.startsWith('sk_test_')) {
    return reply({ error: 'M-Pesa test checkout is not configured. The Paystack test secret key must be added in Cloudflare.' }, 503);
  }
  try {
    // Browser POST requests must come from the website; never trust browser prices.
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) return reply({ error: 'Invalid checkout origin.' }, 403);
    if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
      return reply({ error: 'Invalid request type.' }, 415);
    }
    const input = await request.json();
    const email = typeof input?.email === 'string' ? input.email.trim() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: 'Please provide a valid email address.' }, 400);
    if (!Array.isArray(input?.items) || input.items.length < 1 || input.items.length > 10) return reply({ error: 'Your shopping cart is invalid.' }, 400);
    let total = 0;
    const seen = new Set(); const items = [];
    for (const item of input.items) {
      if (!item || typeof item.sku !== 'string' || !Object.hasOwn(PRICES, item.sku) || seen.has(item.sku) || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 20) {
        return reply({ error: 'Your cart contains an invalid product or quantity.' }, 400);
      }
      seen.add(item.sku);
      total += PRICES[item.sku] * item.qty;
      items.push({ sku: item.sku, qty: item.qty, unit_kes: PRICES[item.sku] });
    }
    if (total < 1 || total > 250000) return reply({ error: 'Shopping cart total is outside the test checkout limit.' }, 400);
    const metadata = {
      shop: 'Safi Nourish', integration: 'safi-test-v2', environment: 'test',
      items, expected_amount_kobo: total * 100, delivery_included: false
    };
    const paystack = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        email, amount: total * 100, currency: 'KES', channels: ['mobile_money'],
        callback_url: 'https://safi-nourish-co.pages.dev/payment-status.html', metadata
      })
    });
    const data = await paystack.json();
    if (!paystack.ok || data?.status !== true || typeof data.data?.authorization_url !== 'string') {
      return reply({ error: 'Paystack could not start the test payment. Check Paystack settings or try again.' }, 502);
    }
    const url = new URL(data.data.authorization_url);
    if (url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com') return reply({ error: 'Unexpected payment destination.' }, 502);
    return reply({ checkout_url: url.href, reference: data.data.reference, subtotal_kes: total, test_mode: true });
  } catch (_) {
    return reply({ error: 'Unable to initialize test checkout right now.' }, 502);
  }
}
