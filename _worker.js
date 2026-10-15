/* Safi Nourish — Cloudflare Pages advanced-mode Paystack TEST checkout API.
 * Upload ONLY this file to the ROOT of the Pages project, next to index.html.
 * This module deliberately rejects live Paystack secret keys.
 * Existing public pages and product images are served by env.ASSETS.
 */
const PRICES = Object.freeze({
  'beef-glass-1000': 850, 'beef-glass-500': 450,
  'beef-plastic-1000': 750, 'beef-plastic-500': 350,
  'sheep-glass-1000': 1150, 'sheep-glass-500': 600,
  'sheep-plastic-1000': 950, 'sheep-plastic-500': 500,
  'beef-bulk-10000': 7000, 'sheep-bulk-10000': 9000
});
const RESPONSE_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: RESPONSE_HEADERS });
const testKey = env => typeof env?.PAYSTACK_SECRET_KEY === 'string' && env.PAYSTACK_SECRET_KEY.startsWith('sk_test_');
const validReference = value => typeof value === 'string' && /^[A-Za-z0-9._=\-]{6,120}$/.test(value);

async function initialize(request, env) {
  if (!testKey(env)) return json({ error: 'M-Pesa test checkout is not configured. Add PAYSTACK_SECRET_KEY as a test secret in Cloudflare Pages settings.' }, 503);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Invalid checkout origin.' }, 403);
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json({ error: 'Invalid request type.' }, 415);
  let input;
  try { input = await request.json(); } catch (_) { return json({ error: 'Invalid checkout request.' }, 400); }
  const email = typeof input?.email === 'string' ? input.email.trim() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Please enter a valid test email address.' }, 400);
  if (!Array.isArray(input?.items) || input.items.length < 1 || input.items.length > 10) return json({ error: 'Shopping cart is empty or invalid.' }, 400);
  let totalKes = 0;
  const items = []; const seen = new Set();
  for (const item of input.items) {
    if (!item || typeof item.sku !== 'string' || !Object.hasOwn(PRICES, item.sku) || seen.has(item.sku) || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 20) {
      return json({ error: 'Invalid product or quantity in shopping cart.' }, 400);
    }
    seen.add(item.sku);
    totalKes += PRICES[item.sku] * item.qty;
    items.push({ sku: item.sku, qty: item.qty, unit_kes: PRICES[item.sku] });
  }
  if (totalKes < 1 || totalKes > 250000) return json({ error: 'This cart exceeds the test checkout limit.' }, 400);
  const expected = totalKes * 100;
  const metadata = { shop: 'Safi Nourish', integration: 'safi-test-v2', environment: 'test', items, expected_amount_kobo: expected, delivery_included: false };
  try {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email, amount: expected, currency: 'KES', channels: ['mobile_money'], callback_url: `${new URL(request.url).origin}/payment-status.html`, metadata })
    });
    const data = await response.json();
    if (!response.ok || data?.status !== true || typeof data.data?.authorization_url !== 'string' || !validReference(data.data.reference)) {
      return json({ error: 'Paystack could not start this test payment. Check that test mobile money is enabled for your Paystack account.' }, 502);
    }
    const target = new URL(data.data.authorization_url);
    if (target.protocol !== 'https:' || target.hostname !== 'checkout.paystack.com') return json({ error: 'Unexpected payment destination.' }, 502);
    return json({ checkout_url: target.href, reference: data.data.reference, subtotal_kes: totalKes, test_mode: true });
  } catch (_) { return json({ error: 'Unable to connect to Paystack. Please try again later.' }, 502); }
}

async function verify(request, env) {
  if (!testKey(env)) return json({ error: 'Test verification is not configured. Add PAYSTACK_SECRET_KEY as a test secret in Cloudflare Pages settings.' }, 503);
  const reference = new URL(request.url).searchParams.get('reference') || '';
  if (!validReference(reference)) return json({ error: 'Invalid payment reference.' }, 400);
  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` }
    });
    const data = await response.json();
    if (!response.ok || data?.status !== true || !data.data) return json({ error: 'Paystack could not verify this payment reference.' }, 502);
    const transaction = data.data;
    let metadata = transaction.metadata;
    if (typeof metadata === 'string') { try { metadata = JSON.parse(metadata); } catch (_) { metadata = null; } }
    if (!metadata || metadata.shop !== 'Safi Nourish' || metadata.integration !== 'safi-test-v2' || metadata.environment !== 'test' || transaction.domain !== 'test' || transaction.currency !== 'KES' || transaction.reference !== reference) {
      return json({ error: 'This reference is not a Safi Nourish test payment.' }, 400);
    }
    if (!Array.isArray(metadata.items) || metadata.items.length < 1 || metadata.items.length > 10) return json({ error: 'Invalid payment product details.' }, 400);
    let expected = 0; const seen = new Set();
    for (const item of metadata.items) {
      if (!item || typeof item.sku !== 'string' || !Object.hasOwn(PRICES, item.sku) || seen.has(item.sku) || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 20 || item.unit_kes !== PRICES[item.sku]) {
        return json({ error: 'Invalid payment product details.' }, 400);
      }
      seen.add(item.sku);
      expected += PRICES[item.sku] * item.qty * 100;
    }
    if (transaction.amount !== expected || metadata.expected_amount_kobo !== expected || expected > 25000000) return json({ error: 'Paystack amount does not match the order.' }, 400);
    const status = transaction.status === 'success' ? 'success' : ['failed', 'abandoned', 'reversed'].includes(transaction.status) ? 'failed' : 'pending';
    return json({ status, reference, subtotal_kes: expected / 100, test_mode: true, delivery_included: false });
  } catch (_) { return json({ error: 'Payment verification is temporarily unavailable.' }, 502); }
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/api/initialize-payment') {
      if (request.method !== 'POST') return json({ error: 'Use POST to initialize test checkout.' }, 405);
      return initialize(request, env);
    }
    if (path === '/api/verify-payment') {
      if (request.method !== 'GET') return json({ error: 'Use GET to verify a test checkout.' }, 405);
      return verify(request, env);
    }
    if (path.startsWith('/api/')) return json({ error: 'Unknown payment API route.' }, 404);
    return env.ASSETS.fetch(request);
  }
};
