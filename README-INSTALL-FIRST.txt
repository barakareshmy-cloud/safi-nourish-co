SAFI NOURISH — TEST CHECKOUT PACKAGE
=====================================
WHAT IS INSIDE
- safi-checkout.js: adds a cart to the existing product cards, prices all ten distinct SKUs and handles repeated featured displays (18 cards in total).
- functions/api/initialize-payment.js: Cloudflare Pages secure server-side Paystack TEST initialization (replaces old 8-SKU version).

INSTALLATION (GITHUB / CLOUDFLARE PAGES)
1. Extract this ZIP on your computer. Do NOT upload the ZIP itself to GitHub.
2. Upload safi-checkout.js into the ROOT of the GitHub repository (same folder as index.html).
3. Upload functions/api/initialize-payment.js to that exact nested path, replacing the previous file. GitHub's 'Add file -> Upload files' can upload folders using drag and drop in browsers that support it; alternatively edit the existing function and paste its file content.
4. Your existing pages must LOAD the checkout script. In each page that displays product cards, put <script defer src="/safi-checkout.js"></script> just before </body>. For a JS-driven app, place this after the code that creates the product cards; otherwise the card buttons might not be detected. The script expects .actual-shelf-card cards, h3 titles, .actual-price labels, .actual-shop-btn buttons. Different markup needs adaptation.
5. Commit and wait until Cloudflare Pages deployment succeeds. The Paystack key must be stored in Cloudflare as an encrypted production secret named PAYSTACK_SECRET_KEY and begin sk_test_. If added after a deployment, deploy again.
6. Test the cart for 500g, 1kg, and 10L bulk items, including duplicated featured displays. Test with Paystack sandbox only.

PRICES: beef glass 1kg 850, 500g 450; beef plastic 1kg 750, 500g 350; sheep glass 1kg 1150, 500g 600; sheep plastic 1kg 950, 500g 500; beef bulk 10L 7000; sheep bulk 10L 9000.

SAFETY / LIMITATIONS
- TEST ONLY: the backend intentionally refuses a LIVE Paystack key. This is not a fully launched store.
- Product totals EXCLUDE delivery. Do not accept real orders or claim they are fulfilled from this script.
- It does not save orders, collect delivery addresses, or independently verify Paystack payment success. Those are REQUIRED before production, together with webhook verification, durable order storage, duplicate-event prevention and live-activation review.
- Existing pages have not been included or edited because the full original repository was not available to bundle. The single script tag is a required manual step; this ZIP does not automatically activate buttons.
- Changing front-end prices without updating the server-side price table will not change charge amounts. The server recalculates prices securely.
- Paystack may not always offer mobile_money in test checkout exactly like its live flow; use Paystack's current sandbox instructions.
