/* Safi Nourish: 18 product displays, 10 SKUs, TEST MODE ONLY. */
(() => {
  "use strict";
  const prices = {
    "beef-glass-1000": 850, "beef-glass-500": 450,
    "beef-plastic-1000": 750, "beef-plastic-500": 350,
    "sheep-glass-1000": 1150, "sheep-glass-500": 600,
    "sheep-plastic-1000": 950, "sheep-plastic-500": 500,
    "beef-bulk-10000": 7000, "sheep-bulk-10000": 9000
  };
  const basket = new Map();
  const money = n => `KES ${n.toLocaleString("en-KE")}`;
  const names = id => {
    const [kind, pack, size] = id.split("-");
    return `${kind === "beef" ? "Beef" : "Sheep"} Tallow · ${size === "10000" ? "10L Bulk Bucket" : (size === "1000" ? "1kg" : "500g") + " " + pack}`;
  };
  const modal = document.createElement("dialog");
  modal.setAttribute("aria-label", "Safi Nourish test checkout");
  modal.style.cssText = "border:0;border-radius:14px;max-width:470px;width:calc(100% - 36px);padding:24px;box-shadow:0 14px 55px #0004;color:#173b2a";
  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
      <h2 style="margin:0;font-size:23px">Your shopping bag</h2>
      <button type="button" id="safi-close" aria-label="Close cart" style="font-size:24px;background:none;border:0;cursor:pointer">×</button>
    </div>
    <p style="font-size:13px;font-weight:700;color:#9b5b15">TEST MODE — no real payment is collected</p>
    <div id="safi-items"></div>
    <p><strong>Subtotal: <span id="safi-total"></span></strong></p>
    <p style="font-size:13px">Delivery fees are not included. Do not place real orders through this test checkout.</p>
    <form id="safi-pay-form">
      <label for="safi-email" style="display:block;margin-bottom:6px">Your email for testing</label>
      <input id="safi-email" type="email" required autocomplete="email" placeholder="you@example.com" style="box-sizing:border-box;width:100%;padding:11px;border:1px solid #ccc;border-radius:8px"/>
      <button id="safi-pay" type="submit" style="display:block;width:100%;margin-top:15px;padding:13px;border:0;border-radius:8px;background:#205b3f;color:white;font-weight:700;cursor:pointer">Proceed to Paystack test checkout</button>
    </form>
    <p id="safi-message" role="status" style="font-size:13px"></p>`;
  document.body.appendChild(modal);

  const itemsBox = modal.querySelector("#safi-items");
  const totalBox = modal.querySelector("#safi-total");
  const message = modal.querySelector("#safi-message");
  const payButton = modal.querySelector("#safi-pay");
  const floating = document.createElement("button");
  floating.type = "button";
  floating.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:500;background:#205b3f;color:white;border:0;border-radius:24px;padding:13px 19px;box-shadow:0 4px 20px #0003;font-weight:700;cursor:pointer";
  document.body.appendChild(floating);

  function draw() {
    itemsBox.replaceChildren();
    let total = 0, count = 0;
    for (const [id, qty] of basket) {
      const price = prices[id];
      if (!price || !qty) continue;
      total += price * qty; count += qty;
      const line = document.createElement("div");
      line.style.cssText = "border-bottom:1px solid #ddd;padding:11px 0;display:flex;justify-content:space-between;gap:12px;align-items:center";
      const desc = document.createElement("span");
      desc.textContent = `${names(id)} × ${qty} — ${money(price * qty)}`;
      const controls = document.createElement("span");
      for (const [symbol, delta] of [["−", -1], ["+", 1]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = symbol;
        button.setAttribute("aria-label", `${delta > 0 ? "Add" : "Remove"} one ${names(id)}`);
        button.style.cssText = "margin-left:5px;padding:5px 9px;cursor:pointer";
        button.onclick = () => {
          const next = basket.get(id) + delta;
          if (next <= 0) basket.delete(id);
          else if (next <= 20) basket.set(id, next);
          draw();
        };
        controls.appendChild(button);
      }
      line.append(desc, controls); itemsBox.appendChild(line);
    }
    floating.textContent = `🛒 Cart (${count})`;
    totalBox.textContent = money(total);
    payButton.disabled = !count;
    if (!count) itemsBox.textContent = "Your bag is empty. Choose a product first.";
  }
  floating.onclick = () => { draw(); modal.showModal(); };
  modal.querySelector("#safi-close").onclick = () => modal.close();

  // Keep the existing product images and layout unchanged.
  document.querySelectorAll(".actual-shelf-card").forEach(card => {
    const title = card.querySelector("h3")?.textContent || "";
    const found = title.match(/^(Beef|Sheep) Tallow\s*[—–-]\s*(1kg|500g)\s+(Glass|Plastic)\s+Jar/i);
    const bulk = title.match(/(Beef|Sheep)\s*Tallow\s*[—–-]?\s*10\s*(?:L|litres?)\s*(?:Bulk)?/i);
    if (!found && !bulk) return;
    const id = found
      ? `${found[1].toLowerCase()}-${found[3].toLowerCase()}-${found[2].toLowerCase() === "1kg" ? "1000" : "500"}`
      : `${bulk[1].toLowerCase()}-bulk-10000`;
    const label = card.querySelector(".actual-price");
    if (label) label.textContent = `${money(prices[id])}.00`;
    const button = card.querySelector(".actual-shop-btn");
    if (!button) return;
    button.textContent = "Add to cart +";
    button.removeAttribute("target");
    button.addEventListener("click", event => {
      event.preventDefault();
      basket.set(id, Math.min(20, (basket.get(id) || 0) + 1));
      message.textContent = "";
      draw(); modal.showModal();
    });
  });
  modal.querySelector("#safi-pay-form").addEventListener("submit", async event => {
    event.preventDefault();
    const email = modal.querySelector("#safi-email").value.trim();
    if (!basket.size || !email) return;
    payButton.disabled = true;
    message.textContent = "Connecting to Paystack test checkout…";
    try {
      const items = [...basket].map(([id, qty]) => {
        const [kind, pack, size] = id.split("-");
        return {kind, pack, size: Number(size), qty};
      });
      const response = await fetch("/api/initialize-payment", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email, items})
      });
      const result = await response.json();
      if (!response.ok || !result.checkout_url) throw new Error(result.error || "Checkout unavailable");
      const url = new URL(result.checkout_url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.paystack.com") {
        throw new Error("Unexpected payment destination");
      }
      location.assign(url.href);
    } catch (error) {
      message.textContent = error.message || "Please try again";
      payButton.disabled = false;
    }
  });
  draw();
})();
