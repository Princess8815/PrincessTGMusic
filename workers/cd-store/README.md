# PrincessTG CD store (PR #24)

## Default: checkout disabled
This is a test-mode integration. No real credentials or destination rates are included. No Firebase Blaze functions are required. Use commercial-capable hosting, not GitHub Pages, before enabling live payments.

## 1. Firebase
Publish the complete **firestore-pr24-purchase.rules** delivered with PR #24. Use the latest full rules, then apply the visit-discovery adjustment below: Shelly is allowed in the ordinary encounter ID allowlist, Tide is never browser-creatable. Existing album permissions support public catalog reads and staff-only listing writes.

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
Shelly is an ordinary store-visit discovery, saved using the existing client-side collection flow. Tide is the only purchase-exclusive collectible and is revealed in rainbow colors on the verified order confirmation screen. Test purchases show Tide but do not grant production rewards. The Worker checks the Stripe PaymentIntent's amount, currency, environment and order ID. A signed-in buyer's verified Firebase ID token binds the order to their UID. A guest may claim a paid order using the private session order token and a verified Firebase sign-in; each order can bind to only one UID.

The Worker needs a dedicated Google service account to write the paid collectible documents via Firestore REST. Grant only the necessary IAM data access (document get and create permissions; scope to the appropriate database where supported). Do not use Owner or Editor. The Worker must be treated as trusted infrastructure because service-account access bypasses Firestore client rules. Store the JSON credentials only with:
```sh
npx wrangler secret put FIREBASE_REWARD_SERVICE_ACCOUNT
```
Set REWARD_FIREBASE_PROJECT to the project that the credential and buyer token belong to. Live mode requires this to match FIREBASE_PROJECT. Sandbox payments cannot award production collectibles: leave REWARD_FIREBASE_PROJECT empty for ordinary testing, or use a separate test Firebase project with its own account, rules, credentials and frontend configuration. A Stripe test payment on the production Firebase site never grants Tide. Shelly is independent of payment mode. Keep the sandbox D1 database separate from production. Existing documents from an earlier permissive draft must be audited/deleted if unearned.

## 4. Before live checkout
- Verify the store with actual sandbox payments (success, decline, 3DS, cancellation, duplicate webhook, wrong order amount, retry after failed Formspree delivery, signed-in and guest claim).
- Confirm ordinary Shelly discoveries can be saved and client-side Firestore writes to Tide are denied.
- Review fulfillment, tax calculations, returns/refunds, privacy disclosures and retention of customer address data. D1 holds addresses for order processing; restrict access and implement a retention/deletion policy before launch.
- Configure abuse/rate limits and monitor Worker/D1/Stripe/Formspree quotas. Stripe Tax, payment processing and other services may charge fees.
- Use separate live credentials, webhook, D1 database and an appropriate storefront origin. Set STORE_MODE=live and LIVE_READY=yes only once all launch checks pass. Live checkout is blocked when the allowed origins include github.io.
- Refunds, inventory, chargeback handling and physical shipping are manual in this first version; review paid orders in Stripe and D1. Duplicate Formspree notification emails are possible if delivery succeeds but recording the result fails; deduplicate by order ID.

## Refund synchronization (upgrade existing sandbox first)
1. From workers/cd-store, run `npx wrangler d1 execute princesstg-cd-orders --remote --file=migrations/0001_refund_sync.sql` before deploying the new Worker. This creates a separate table; existing orders are preserved. Fresh databases get the table via schema.sql.
2. In the existing Stripe sandbox webhook destination, keep payment_intent.succeeded and add refund.created, refund.updated, refund.failed, charge.refunded. Keep the existing signing secret.
3. Deploy with `npx wrangler deploy` (keep STORE_MODE=test). Resend the refund event from the previously refunded test order. A replayed payment_intent.succeeded event also reconciles current refund status.
4. Verify: `SELECT o.id,o.status,o.total,r.refunded_cents,r.pending_cents,r.tax_state,r.tax_reversal FROM orders o LEFT JOIN order_refunds r ON r.order_id=o.id ORDER BY o.created DESC;`
5. Test a new full refund, duplicate delivery, partial refund and pending/failed refund where supported. Full refunds should be recorded as refunded with tax_state=reversed and a tax_reversal ID; partial refunds are recorded as partially_refunded and tax_state=manual_review. Pending refunds pause automated fulfillment. Failed/canceled refunds do not count as refunded.
6. Partial refunds require manual allocation and a Stripe Tax reversal for the affected items/shipping. Once manual_review is recorded, subsequent full refunds also require manual reconciliation to avoid a double tax reversal. Do not reverse tax manually for a full_pending order until the automated retry has been investigated. If Stripe created a reversal but D1 failed to save it, locate the unique reference cd-refund-full-ORDER_ID and reconcile manually rather than inventing another reference.
7. Stripe dashboard remains the place to issue refunds. No customer-facing refund endpoint, automatic refund email, shipment cancellation, chargeback handling or reward revocation is added. Review order status and Stripe before shipping; prior shipping emails cannot be recalled. Existing orders are not bulk scanned; resend their refund events to reconcile. The cron retries full tax reversals; expired original tax calculations and partial tax adjustments need operator review. Never issue a second monetary refund simply because tax reversal needs attention.
8. Stripe docs: https://docs.stripe.com/api/tax/transactions/create_reversal and https://docs.stripe.com/api/refunds/list .

## Store reef update (PR #28)
- In your existing complete Firestore rules, add 'shelly' to the ordinary create-only axolotl discovery ID allowlist under /users/{uid}/axolotls/{axolotlId}. Preserve all owner, active-account and field validation rules and all existing free IDs (including pip and hex). Keep 'tide' excluded from every client create/update allowlist. Do not deploy an old complete rules file over newer features. Verify the actual deployed rules; this repository does not contain them.
- No additional D1 migration is required for this change. Redeploy the Worker so it grants only Tide, not Shelly. Existing collections are preserved; old discoveries are not automatically revoked. Test mode reveals Tide visually after confirmed payment but must never grant Tide in the production Firebase project.
- Verify on desktop and mobile: store visit awards Shelly once, Tide is absent from checkout/decline/cancel views, successful payment hides catalog/cart/checkout and shows rainbow Tide, Continue shopping restores catalog and permits a second checkout without reload, full and partial refunds show refund status rather than Tide, guest claim remains bound to the verified order, and a duplicate payment event cannot create a second Tide record. Production Tide requires the separate service-account setup above.
