
const PRICES = {
  "beef-glass-500": 450,
  "beef-glass-1000": 850,
  "beef-plastic-500": 350,
  "beef-plastic-1000": 750,
  "sheep-glass-500": 600,
  "sheep-glass-1000": 1150,
  "sheep-plastic-500": 500,
  "sheep-plastic-1000": 950
};

export async function onRequestPost({ request, env }) {
  const respond = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });

  // Keep payments in test mode until the shop is ready.
  const secret = env.PAYSTACK_SECRET_KEY;
  if (!secret || !secret.startsWith("sk_test_")) {
    return respond({ error: "Test payment key unavailable" }, 503);
  }

  try {
    const body = await request.json();
    const email = body?.email;
    const items = body?.items;

    if (
      typeof email !== "string" ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !Array.isArray(items) ||
      items.length < 1 ||
      items.length > 20
    ) {
      return respond({ error: "Invalid customer or cart" }, 400);
    }

    let total = 0;
    const orderItems = [];

    for (const item of items) {
      const id = `${item?.kind}-${item?.pack}-${item?.size}`;
      const unitPrice = PRICES[id];

      if (
        !unitPrice ||
        !Number.isInteger(item.qty) ||
        item.qty < 1 ||
        item.qty > 20
      ) {
        return respond({ error: "Invalid product or quantity" }, 400);
      }

      total += unitPrice * item.qty;
      orderItems.push({
        product: id,
        quantity: item.qty,
        unit_price_kes: unitPrice
      });
    }

    if (total > 250000) {
      return respond({ error: "Order exceeds test limit" }, 400);
    }

    const payment = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          amount: total * 100,
          currency: "KES",
          channels: ["mobile_money"],
          metadata: JSON.stringify({
            shop: "Safi Nourish",
            items: orderItems,
            delivery_included: false
          })
        })
      }
    );

    const result = await payment.json();

    if (!payment.ok || !result.status ||
        !result.data?.authorization_url) {
      return respond({
        error: "Paystack could not initialize payment"
      }, 502);
    }

    return respond({
      checkout_url: result.data.authorization_url,
      reference: result.data.reference,
      amount_kes: total
    });

  } catch (error) {
    return respond({ error: "Unable to initialize payment" }, 400);
  }
}
