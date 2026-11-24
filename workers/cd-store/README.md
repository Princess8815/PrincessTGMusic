# PrincessTG CD store (PR #24)

## Default: checkout disabled
This is a test-mode integration. No real credentials or destination rates are included. No Firebase Blaze functions are required. Use commercial-capable hosting, not GitHub Pages, before enabling live payments.

## 1. Firebase
Publish the complete **firestore-pr24-purchase.rules** delivered with PR #24. It retains existing rules and explicitly excludes Shelly and Tide from browser-created collectible IDs. Do not use the earlier draft rules that allowed those two IDs. Existing album permissions support public catalog reads and staff-only listing writes.

Admin → Albums → CD Store → Load albums → select an album → enable sales → set volume count, names, USD prices and track assignments → Save. Each volume is a separate CD SKU. The default is $10 per disc. Inventory, CD capacity, packaging and fulfillment are manual.

## 2. Cloudflare Worker and D1
From the repository root:
```sh
cd workers/cd-store
npx wrangler login
npx wrangler d1 create princesstg-cd-orders
```
Replace the database_id placeholder in wrangler.toml. Apply the schema to a new database:
```sh
npx wrangler d1 execute princesstg-cd-orders --remote --file=schema.sql
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_PUBLISHABLE_KEY
npx wrangler secret put FORMSPREE_URL
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```
Use Stripe sandbox keys beginning sk_test_ and pk_test_. Set FORMSPREE_URL to the dedicated, verified recipient form URL https://formspree.io/f/... . Register the Stripe webhook at the deployed Worker URL + /webhook for payment_intent.succeeded and set STRIPE_WEBHOOK_SECRET to the endpoint's signing secret. Never commit these values.

Set CD_TAX_CODE to the Stripe Tax code appropriate to your physical CDs. Configure the seller address and actual tax registrations in Stripe. Shipping rates are merchant-configured, not live carrier quotes. SHIPPING_ZONES is a JSON array with country (ISO alpha-2), state/province code or "*", city or "*", firstCents and extraCents. Example for sandbox testing only:
```json
[{"country":"US","state":"WI","city":"*","firstCents":500,"extraCents":100}]
```
No destination is enabled until you configure it. Confirm your actual packaging costs, international shipping and tax duties before opening sales.

```sh
npx wrangler deploy
```
Paste the Worker HTTPS URL into script/store-config.js, and set ALLOWED_ORIGINS to the exact storefront origin. Test checkout with Stripe test cards.

## 3. Purchase-only collectible security
Shelly greets shoppers at shipping and Tide appears next to Stripe Elements. Both remain locked until a verified successful purchase. The Worker checks the Stripe PaymentIntent's amount, currency, environment and order ID. A signed-in buyer's verified Firebase ID token binds the order to their UID. A guest may claim a paid order using the private session order token and a verified Firebase sign-in; each order can bind to only one UID.

The Worker needs a dedicated Google service account to write the paid collectible documents via Firestore REST. Grant only the necessary IAM data access (document get and create permissions; scope to the appropriate database where supported). Do not use Owner or Editor. The Worker must be treated as trusted infrastructure because service-account access bypasses Firestore client rules. Store the JSON credentials only with:
```sh
npx wrangler secret put FIREBASE_REWARD_SERVICE_ACCOUNT
```
Set REWARD_FIREBASE_PROJECT to the project that the credential and buyer token belong to. Live mode requires this to match FIREBASE_PROJECT. Sandbox payments cannot award production collectibles: leave REWARD_FIREBASE_PROJECT empty for ordinary testing, or use a separate test Firebase project with its own account, rules, credentials and frontend configuration. A Stripe test payment on the production Firebase site never grants Shelly or Tide. Keep the sandbox D1 database separate from production. Existing documents from an earlier permissive draft must be audited/deleted if unearned.

## 4. Before live checkout
- Verify the store with actual sandbox payments (success, decline, 3DS, cancellation, duplicate webhook, wrong order amount, retry after failed Formspree delivery, signed-in and guest claim).
- Confirm client-side Firestore writes to both paid collectible IDs are denied.
- Review fulfillment, tax calculations, returns/refunds, privacy disclosures and retention of customer address data. D1 holds addresses for order processing; restrict access and implement a retention/deletion policy before launch.
- Configure abuse/rate limits and monitor Worker/D1/Stripe/Formspree quotas. Stripe Tax, payment processing and other services may charge fees.
- Use separate live credentials, webhook, D1 database and an appropriate storefront origin. Set STORE_MODE=live and LIVE_READY=yes only once all launch checks pass. Live checkout is blocked when the allowed origins include github.io.
- Refunds, inventory, chargeback handling and physical shipping are manual in this first version; review paid orders in Stripe and D1. Duplicate Formspree notification emails are possible if delivery succeeds but recording the result fails; deduplicate by order ID.
