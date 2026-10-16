/* Safi Nourish — catalogue cart for Paystack-hosted test or live M-Pesa checkout.
   Browser prices are display-only. Cloudflare validates EVERY SKU and price. */
(() => {
  'use strict';
  const catalog = Object.freeze({
    'beef-glass-1000': ['Beef Tallow · 1kg Glass Jar', 850],
    'beef-glass-500': ['Beef Tallow · 500g Glass Jar', 450],
    'beef-plastic-1000': ['Beef Tallow · 1kg Plastic Jar', 750],
    'beef-plastic-500': ['Beef Tallow · 500g Plastic Jar', 350],
    'sheep-glass-1000': ['Sheep Tallow · 1kg Glass Jar', 1150],
    'sheep-glass-500': ['Sheep Tallow · 500g Glass Jar', 600],
    'sheep-plastic-1000': ['Sheep Tallow · 1kg Plastic Jar', 950],
    'sheep-plastic-500': ['Sheep Tallow · 500g Plastic Jar', 500],
    'beef-bulk-10000': ['Beef Tallow · 10L Bulk Bucket', 7000],
    'sheep-bulk-10000': ['Sheep Tallow · 10L Bulk Bucket', 9000]
  });
  const storeKey = 'safi-paystack-test-cart-v2'; // preserve existing shopper baskets on upgrade
  const cart = new Map();
  let checkoutMode = 'disabled';
  let checkoutEnabled = false;
  try {
    const saved = JSON.parse(sessionStorage.getItem(storeKey) || '[]');
    if (Array.isArray(saved)) for (const item of saved) {
      if (Array.isArray(item) && Object.hasOwn(catalog, item[0]) && Number.isInteger(item[1]) && item[1] >= 1 && item[1] <= 20) cart.set(item[0], item[1]);
    }
  } catch (_) { /* the cart still works without browser storage */ }
  const fmt = n => `KSh ${n.toLocaleString('en-KE')}`;
  const save = () => { try { sessionStorage.setItem(storeKey, JSON.stringify([...cart])); } catch (_) {} };
  const css = document.createElement('style');
  css.textContent = `
    #safi-cart-button{position:fixed;right:18px;bottom:18px;z-index:9990;border:0;border-radius:30px;padding:13px 20px;background:#195438;color:white;font-weight:750;box-shadow:0 5px 22px #0005;cursor:pointer;min-height:48px}
    #safi-cart-modal{border:0;border-radius:17px;padding:22px;width:min(490px,calc(100% - 28px));max-height:87vh;overflow:auto;color:#173c2a;background:#fff;box-shadow:0 12px 55px #0004;box-sizing:border-box}
    #safi-cart-modal::backdrop{background:rgba(0,0,0,.65)}
    #safi-cart-modal .safi-header{display:flex;align-items:center;justify-content:space-between;gap:10px}
    #safi-cart-modal h2{margin:0;font-size:23px;color:#173c2a}
    #safi-cart-modal .safi-line{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid #ddd}
    #safi-cart-modal .safi-line strong{font-size:14px;display:block}
    #safi-cart-modal .safi-line small{color:#55665e;display:block;margin-top:5px}
    #safi-cart-modal .safi-qty{white-space:nowrap;display:flex;align-items:center;gap:7px}
    #safi-cart-modal .safi-qty button{background:#edf4ee;border:1px solid #c7d6ca;padding:5px 9px;border-radius:7px;font-size:17px;cursor:pointer}
    #safi-cart-modal input{box-sizing:border-box;width:100%;margin-top:7px;padding:11px;border-radius:8px;border:1px solid #9baaa0;font-size:16px}
    #safi-cart-modal .safi-primary{display:block;width:100%;background:#195438;color:#fff;padding:14px;border:0;border-radius:8px;margin-top:13px;font-weight:750;cursor:pointer}
    #safi-cart-modal button:disabled{opacity:.55;cursor:not-allowed}
    #safi-cart-modal .safi-test{color:#865800;font-size:13px;font-weight:700}
    #safi-cart-modal .safi-note{font-size:13px;line-height:1.55;color:#516158}
    #safi-cart-modal .safi-status{font-size:14px;min-height:1.5em}
  `;
  document.head.append(css);
  const button = document.createElement('button');
  button.id = 'safi-cart-button';
  button.type = 'button';
  button.setAttribute('aria-label', 'Open Safi Nourish shopping cart');
  const modal = document.createElement('dialog');
  modal.id = 'safi-cart-modal';
  modal.setAttribute('aria-label', 'Safi Nourish shopping cart');
  modal.innerHTML = `
    <div class="safi-header"><h2>Shopping Cart</h2><button type="button" id="safi-close-cart" aria-label="Close shopping cart" style="background:transparent;border:0;cursor:pointer;font-size:25px">×</button></div>
    <p class="safi-test" id="safi-payment-mode">Checking secure payment availability…</p>
    <div id="safi-cart-lines"></div>
    <p><strong>Product subtotal: <span id="safi-cart-total"></span></strong></p>
    <p class="safi-note">Delivery is NOT included in the displayed total. Safi Nourish will arrange delivery and any delivery charges separately.</p>
    <form id="safi-checkout-form">
      <label for="safi-checkout-email">Email address for your order</label>
      <input id="safi-checkout-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" maxlength="254" required>
      <label style="display:flex;align-items:flex-start;gap:9px;font-size:13px;line-height:1.5;margin-top:13px"><input id="safi-delivery-agreement" type="checkbox" required style="width:auto;margin:4px 0 0;flex:none">I understand that delivery is not included in the product subtotal and any delivery fee will be arranged separately.</label>
      <button type="submit" class="safi-primary" id="safi-checkout-pay" disabled>Checking payment service…</button>
    </form>
    <p class="safi-status" role="status" aria-live="polite" id="safi-checkout-message"></p>
    <p class="safi-note"><a href="https://wa.me/254740450447" target="_blank" rel="noopener noreferrer">Contact Safi Nourish about delivery</a></p>`;
  document.body.append(button, modal);
  const lines = modal.querySelector('#safi-cart-lines');
  const totalEl = modal.querySelector('#safi-cart-total');
  const status = modal.querySelector('#safi-checkout-message');
  const payButton = modal.querySelector('#safi-checkout-pay');
  const modeText = modal.querySelector('#safi-payment-mode');
  function render() {
    lines.replaceChildren();
    let total = 0, count = 0;
    for (const [sku, qty] of cart) {
      const [label, price] = catalog[sku];
      total += qty * price; count += qty;
      const row = document.createElement('div'); row.className = 'safi-line';
      const info = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = label;
      const detail = document.createElement('small'); detail.textContent = `${fmt(price)} × ${qty} = ${fmt(price * qty)}`;
      info.append(name, detail);
      const qtyArea = document.createElement('div'); qtyArea.className = 'safi-qty';
      for (const [sign, delta] of [['−', -1], ['+', 1]]) {
        const adjust = document.createElement('button'); adjust.type = 'button';
        adjust.textContent = sign;
        adjust.setAttribute('aria-label', `${delta === 1 ? 'Add' : 'Remove'} one ${label}`);
        adjust.addEventListener('click', () => {
          const newQty = (cart.get(sku) || 0) + delta;
          if (newQty <= 0) cart.delete(sku);
          else if (newQty <= 20) cart.set(sku, newQty);
          save(); status.textContent = ''; render();
        });
        qtyArea.append(adjust);
      }
      row.append(info, qtyArea); lines.append(row);
    }
    if (!count) lines.textContent = 'Your cart is empty. Please add a product.';
    button.textContent = `🛒 Cart (${count})`;
    totalEl.textContent = fmt(total);
    payButton.disabled = !count || !checkoutEnabled;
  }
  function openCart() { render(); if (!modal.open) modal.showModal(); void loadPaymentConfig(); }
  // Recheck on every cart opening. Never cache or assume payment readiness.
  let configRequestId = 0;
  async function loadPaymentConfig(){
    const requestId = ++configRequestId;
    checkoutEnabled = false;
    checkoutMode = 'disabled';
    modeText.textContent = 'Checking live M-Pesa availability…';
    payButton.textContent = 'Checking secure checkout…';
    render();
    const liveHost = 'safi-nourish-co.pages.dev';
    if (location.hostname !== liveHost) {
      modeText.textContent = 'This is not the live Safi Nourish checkout website.';
      status.replaceChildren();
      const link = document.createElement('a');
      link.href = 'https://' + liveHost + '/';
      link.textContent = 'Open Safi Nourish’s live Cloudflare website to place your order.';
      status.append(link);
      payButton.textContent = 'Checkout available on the live website only';
      render();
      return;
    }
    let problem = '';
    try {
      const response = await fetch('/api/checkout-config?check=' + Date.now(), {
        cache: 'no-store', redirect: 'error', headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) throw Error('The payment settings API returned HTTP ' + response.status + '.');
      const type = response.headers.get('content-type') || '';
      if (!type.includes('application/json')) throw Error('The payment settings API returned a web page instead of JSON.');
      const result = await response.json();
      if (requestId !== configRequestId) return;
      checkoutEnabled = result.enabled === true && ['test','live'].includes(result.mode);
      checkoutMode = checkoutEnabled ? result.mode : 'disabled';
      if (!checkoutEnabled) problem = 'Cloudflare reports that live checkout is disabled. Please contact Safi Nourish.';
    } catch (error) {
      if (requestId !== configRequestId) return;
      checkoutEnabled = false;
      checkoutMode = 'disabled';
      problem = 'Payment connection check failed: ' + (error?.message || 'network error') + '. Please contact Safi Nourish.';
    }
    if (checkoutMode === 'live') {
      modeText.textContent = 'SECURE LIVE M-PESA PAYMENT — real money will be charged';
      payButton.textContent = 'Pay securely with M-Pesa';
      status.textContent = '';
    } else if (checkoutMode === 'test') {
      modeText.textContent = 'PAYSTACK TEST MODE — no real M-Pesa charge';
      payButton.textContent = 'Continue to M-Pesa test checkout';
      status.textContent = '';
    } else {
      modeText.textContent = problem;
      payButton.textContent = 'Online payments temporarily unavailable';
    }
    render();
  }
  button.addEventListener('click', openCart);
  modal.querySelector('#safi-close-cart').addEventListener('click', () => modal.close());
  modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
  function add(sku) {
    if (!Object.hasOwn(catalog, sku)) return;
    cart.set(sku, Math.min(20, (cart.get(sku) || 0) + 1));
    status.textContent = ''; save(); openCart();
  }
  document.querySelectorAll('a[data-safi-sku]').forEach(anchor => {
    const sku = anchor.dataset.safiSku;
    if (!Object.hasOwn(catalog, sku)) return;
    anchor.href = '#safi-cart';
    anchor.removeAttribute('target');
    anchor.removeAttribute('rel');
    anchor.textContent = `Add to Cart · ${fmt(catalog[sku][1])}`;
    const card = anchor.closest('article');
    const priceLabel = card?.querySelector('.actual-price');
    if (priceLabel) priceLabel.textContent = fmt(catalog[sku][1]);
    anchor.addEventListener('click', event => { event.preventDefault(); add(sku); });
  });
  modal.querySelector('#safi-checkout-form').addEventListener('submit', async event => {
    event.preventDefault();
    const email = modal.querySelector('#safi-checkout-email').value.trim();
    if (!cart.size || !email || !checkoutEnabled || !modal.querySelector('#safi-delivery-agreement').checked) return;
    payButton.disabled = true;
    status.textContent = 'Connecting to Paystack securely…';
    try {
      const response = await fetch('/api/initialize-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, delivery_agreed: true, items: [...cart].map(([sku, qty]) => ({ sku, qty })) })
      });
      const result = await response.json();
      if (!response.ok || !result.checkout_url) throw new Error(result.error || 'Unable to start checkout.');
      const url = new URL(result.checkout_url);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com') throw new Error('Unexpected payment page.');
      window.location.assign(url.href);
    } catch (error) {
      status.textContent = error.message || 'Unable to connect. Please try again.';
      payButton.disabled = false;
    }
  });
  render();
  loadPaymentConfig();
})();
