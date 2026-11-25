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
Set REWARD_FIREBASE_PROJECT to the project that the credential and buyer token belong to. Live mode requires this to match FIREBASE_PROJECT. Sandbox payments cannot award production collectibles: leave REWARD_FIREBASE_PROJECT empty for ordinary testing, or use a separate test Firebase project with its own account, rules, credentials and frontend configuration. Ordinary Stripe test payments never grant production Tide. The explicitly enabled admin-only test exception below is available for internal testing. Shelly is independent of payment mode. Keep the sandbox D1 database separate from production. Existing documents from an earlier permissive draft must be audited/deleted if unearned.

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
- No additional D1 migration is required for this change. Redeploy the Worker so it grants only Tide, not Shelly. Existing collections are preserved; old discoveries are not automatically revoked. Test mode reveals Tide visually after confirmed payment. Production Tide is restricted to live purchases or the explicitly enabled admin-only exception below.
- Verify on desktop and mobile: store visit awards Shelly once, Tide is absent from checkout/decline/cancel views, successful payment hides catalog/cart/checkout and shows rainbow Tide, Continue shopping restores catalog and permits a second checkout without reload, full and partial refunds show refund status rather than Tide, guest claim remains bound to the verified order, and a duplicate payment event cannot create a second Tide record. Production Tide requires the separate service-account setup above.

## Checkout recovery audit
- All quote, pay, cancel, status and resume actions use one synchronous browser lock; payment cannot be confirmed again until Stripe status permits a retry. Shipping configuration is not reset by repeated clicks. Failed requests retain the same order ID and token; Resume payment reuses that server-side intent. If no order was initialized, cancel the reference and retry. A cancellation before intent creation prevents disclosure of the resulting secret. If cleanup of an unexposed intent fails, review it in Stripe.
- Browser API calls time out after 25 seconds; uncertain payments are not treated as declined. Check status first. No real payment is issued by the recovery action.
- Shelly is queued immediately using the same encounter mechanism as all other free discoveries, including guest/sign-in retry and visible save status. Both collectibles use the same profile grid. Tide remains server-only; ordinary sandbox buyers cannot receive production Tide.
- Verify rules against current deployed version. The separately supplied PR26 cumulative rules lacked Shelly; add only Shelly to the free discovery allowlist, never Tide. No other schema or webhook changes for this audit.

Run `node tests/store-recovery.test.mjs` from `workers/cd-store` for mocked rapid-click, network failure, interrupted checkout, retry and receipt tests. This does not contact Stripe or Firebase.

## Optional administrator sandbox Tide reward
Off by default. To test the real collectible with your own active admin or owner account, keep STORE_MODE=test and set REWARD_FIREBASE_PROJECT to the existing FIREBASE_PROJECT, set ADMIN_TEST_TIDE="yes", and configure the FIREBASE_REWARD_SERVICE_ACCOUNT secret as above. Deploy with npx wrangler deploy. Use the production Firebase login (not a local emulator token) and sign in before starting a new test checkout. The Worker verifies the Firebase signature and current Firestore role, binds that UID at checkout, requires a verified paid Stripe test order, and checks the role again before creating Tide. Ordinary members and guests can still test checkout but are not eligible for production Tide. An older unbound sandbox order cannot be claimed through this exception. The created Tide document records sourceMode=admin_sandbox for audit. Existing Tide records remain untouched. Disable ADMIN_TEST_TIDE when not testing; live payment eligibility is unchanged. Do not publish credentials or put them in browser code. No Firestore rule relaxation or database migration is needed.

## Shippo shipping (PR #28)
Fixed zones remain sandbox-only. Live mode requires Shippo, verified packaging and LIVE_READY=yes. No label-buy API is called. Test/live tokens must match STORE_MODE. Rates are saved in D1 for 15 minutes, bound to address, SKU, quantity and current price. Changed address/cart or forged rates fail; shipping is passed to Stripe Tax. Order payloads and Formspree include carrier, service, shipment/rate IDs and package.
1. Apply migrations/0002_shipping_quotes.sql to both remote databases before deploying (fresh schema includes it). No Firestore rule change.
2. Upload SHIPPO_ORIGIN_JSON as a Worker secret: JSON fields name,street1,street2(optional),city,state,zip,country (US),phone,email. Never commit private origin. Use actual origin or fictitious sandbox address. SHIPPO_API_KEY already uploaded separately for test/live.
3. Set SHIPPO_ENABLED=yes, SHIPPO_COUNTRIES=US initially. Sample SHIPPO_PACKAGE_JSON is illustrative. Measure actual parcels: length,width,baseHeight,discHeight in inches; baseWeight,discWeight in ounces. Set packagingCents,insuranceCents,trackingCents to actual fees. Fees do not automatically buy coverage/tracking. Verify packaging across supported quantities before SHIPPO_PACKAGING_VERIFIED=yes for live.
4. International: explicitly allow reviewed ISO country codes, e.g. US,CA once Canadian requirements are resolved. SHIPPO_CUSTOMS_JSON secret: originCountry (actual CD origin), tariffNumber (verified HS code), signer (authorized legal name), approved:true, incoterm:DDU or DAP as supported by carrier. Verify declarations, destination rules, duties, taxes and product safety/identifiers before enabling. Actual label/customs review is manual. International phone required. No universal shipping guarantee.
5. Live config needs matching settings/secrets, actual tax registration, abuse protection/rate limits for quote/checkout endpoints, retention review and test completion. Keep LIVE_READY=no. Sandbox rates simulated. No storefront Worker URL change yet.
6. Admin Albums > Store > Shipping management reads current configuration and paid order carrier using server-side role verification. Edit settings through Wrangler; manually purchase labels, insurance and tracking through Shippo. No automatic label purchase or customer tracking dashboard yet.

## Expandable physical product catalog
Apply migrations/0003_merchandise.sql to both remote D1 databases, after 0002. Catalog and packaging profiles are isolated by Worker/database; test records do not publish to live. Existing album listings automatically use cd-slim. A staff-saved cd-slim profile overrides the fallback measurements in SHIPPO_PACKAGE_JSON. Global live verification flag still required. Product catalog writes require freshly verified active administrator/owner Firebase credentials; no Firestore rules change. Product tax code is chosen by staff and validated by format (verify actual tax classification with Stripe). Merchandise uses a stable merch:ID SKU and the same payment/refund flow. Draft/enable and featured controls are supported; stock tracking, digital fulfillment and variants are not implemented. Mixed profile orders must be split, and each profile has a measured maximum quantity. International merchandise requires its own verified customs details, plus existing global customs configuration. Profiles use length/width, packaging-only height and weight, per-item added height and weight, and per-package fees. Verify actual packed dimensions/weight across all supported quantities before enabling live. Keep sample CD profile unverified. Existing pending orders retain saved totals; quotes are invalidated by changes in catalog, price, profile or customs settings. No label purchasing is automatic.
