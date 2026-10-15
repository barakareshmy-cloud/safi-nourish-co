/* Cloudflare Pages Function: independently verify Paystack TEST payment status.
   No orders are automatically fulfilled or marked paid in a database. */
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
export async function onRequestGet({ request, env }) {
  const secret = env.PAYSTACK_SECRET_KEY;
  if (typeof secret !== 'string' || !secret.startsWith('sk_test_')) return reply({ error: 'Test verification is not configured.' }, 503);
  const reference = new URL(request.url).searchParams.get('reference') || '';
  if (!/^[A-Za-z0-9._=\-]{6,120}$/.test(reference)) return reply({ error: 'Invalid payment reference.' }, 400);
  try {
    const requestVerification = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { authorization: `Bearer ${secret}` }
    });
    const payload = await requestVerification.json();
    if (!requestVerification.ok || payload?.status !== true || !payload.data) return reply({ error: 'Could not verify this reference with Paystack.' }, 502);
    const transaction = payload.data;
    let meta = transaction.metadata;
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (_) { meta = {}; } }
    if (!meta || meta.shop !== 'Safi Nourish' || meta.integration !== 'safi-test-v2' || meta.environment !== 'test' || transaction.domain !== 'test' || transaction.currency !== 'KES' || transaction.reference !== reference) {
      return reply({ error: 'This transaction is not a Safi Nourish test checkout payment.' }, 400);
    }
    if (!Array.isArray(meta.items) || meta.items.length === 0 || meta.items.length > 10) return reply({ error: 'The order details did not pass verification.' }, 400);
    let expected = 0; const seen = new Set();
    for (const item of meta.items) {
      if (!item || !Object.hasOwn(PRICES, item.sku) || seen.has(item.sku) || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 20 || item.unit_kes !== PRICES[item.sku]) {
        return reply({ error: 'The order details did not pass verification.' }, 400);
      }
      seen.add(item.sku);
      expected += PRICES[item.sku] * item.qty * 100;
    }
    if (transaction.amount !== expected || meta.expected_amount_kobo !== expected || expected > 25000000) {
      return reply({ error: 'Paystack payment total does not match the catalogue order.' }, 400);
    }
    const status = transaction.status === 'success' ? 'success' : ['failed', 'abandoned', 'reversed'].includes(transaction.status) ? 'failed' : 'pending';
    return reply({ status, reference, subtotal_kes: expected / 100, test_mode: true, delivery_included: false });
  } catch (_) { return reply({ error: 'Payment verification is temporarily unavailable.' }, 502); }
}
