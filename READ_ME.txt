Safi Nourish - safer payment confirmation fix

This upgrade lets verified past payments and Paystack webhook confirmations
continue to work even while PAYMENTS_ENABLED=false. It does NOT enable charges.

1. On GitHub, replace the root _worker.js with the file in this ZIP.
2. Commit changes, wait for Cloudflare Production deployment to succeed.
3. Open https://safi-nourish-co.pages.dev/api/confirmation-readiness
4. Expect {"confirmations_ready":true,"new_payments_enabled":false,"environment":"live"}
5. Keep PAYMENTS_ENABLED=false until we have a controlled pilot plan.

Do not paste your Paystack secret key into GitHub or this chat.
