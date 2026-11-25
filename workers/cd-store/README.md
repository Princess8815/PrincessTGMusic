# PrincessTG store

## Sandbox and live environments
`wrangler.toml` selects the sandbox Worker and database. The merchant-approved `wrangler.live.toml` enables live checkout with separate credentials and a separate database; its deployment steps are at the end of this document. Private credentials are stored as Cloudflare secrets. No Firebase Blaze functions are required. The production storefront uses Cloudflare Pages.

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
Fixed zones remain sandbox-only. Live mode requires Shippo, verified packaging or the explicit domestic CD estimate opt-in below, and LIVE_READY=yes. No label-buy API is called. Test/live tokens must match STORE_MODE. Rates are saved in D1 for 15 minutes, bound to address, SKU, quantity and current price. Changed address/cart or forged rates fail; shipping is passed to Stripe Tax. Order payloads and Formspree include carrier, service, shipment/rate IDs and package.
1. Apply migrations/0002_shipping_quotes.sql to both remote databases before deploying (fresh schema includes it). No Firestore rule change.
2. Upload SHIPPO_ORIGIN_JSON as a Worker secret: JSON fields name,street1,street2(optional),city,state,zip,country (US),phone,email. Never commit private origin. Use actual origin or fictitious sandbox address. SHIPPO_API_KEY already uploaded separately for test/live.
3. Set SHIPPO_ENABLED=yes, SHIPPO_COUNTRIES=US initially. Sample SHIPPO_PACKAGE_JSON is illustrative. Measure actual parcels: length,width,baseHeight,discHeight in inches; baseWeight,discWeight in ounces. Set packagingCents,insuranceCents,trackingCents to actual fees. Fees do not automatically buy coverage/tracking. Verify packaging across supported quantities before SHIPPO_PACKAGING_VERIFIED=yes for live.
4. International: explicitly allow reviewed ISO country codes, e.g. US,CA once Canadian requirements are resolved. SHIPPO_CUSTOMS_JSON secret: originCountry (actual CD origin), tariffNumber (verified HS code), signer (authorized legal name), approved:true, incoterm:DDU or DAP as supported by carrier. Verify declarations, destination rules, duties, taxes and product safety/identifiers before enabling. Actual label/customs review is manual. International phone required. No universal shipping guarantee.
5. Live config needs matching settings/secrets and production deployment verification. The checked-in live configuration uses the merchant-approved domestic CD estimate opt-in below. Sandbox quotes do not prove live carrier availability.
6. Admin Albums > Store > Shipping management reads current configuration and paid order carrier using server-side role verification. Edit settings through Wrangler; manually purchase labels, insurance and tracking through Shippo. No automatic label purchase or customer tracking dashboard yet.

## Expandable physical product catalog
Apply migrations/0003_merchandise.sql to both remote D1 databases, after 0002. Catalog and packaging profiles are isolated by Worker/database; test records do not publish to live. Existing album listings automatically use cd-slim. A staff-saved cd-slim profile overrides the fallback measurements in SHIPPO_PACKAGE_JSON. Global live verification flag still required. Product catalog writes require freshly verified active administrator/owner Firebase credentials; no Firestore rules change. Product tax code is chosen by staff and validated by format (verify actual tax classification with Stripe). Merchandise uses a stable merch:ID SKU and the same payment/refund flow. Draft/enable and featured controls are supported; stock tracking, digital fulfillment and variants are not implemented. Mixed profile orders must be split, and each profile has a measured maximum quantity. International merchandise requires its own verified customs details, plus existing global customs configuration. Profiles use length/width, packaging-only height and weight, per-item added height and weight, and per-package fees. Verify actual packed dimensions/weight across all supported quantities before enabling live. Keep sample CD profile unverified. Existing pending orders retain saved totals; quotes are invalidated by changes in catalog, price, profile or customs settings. No label purchasing is automatic.

### USPS-only domestic launch
The Worker currently offers only USPS Ground Advantage and Priority Mail for routine free scheduled pickup at eligible addresses. Other carriers and Media Mail are intentionally excluded; international expansion will require adding reviewed service tokens. In Shippo Settings > Carriers > USPS > Edit, enable test mode and save before testing with the test API token. Switch to appropriate live carrier configuration before production. If no rates return, `npx wrangler tail --config wrangler.toml` shows only safe aggregate rate/message counts, not private shipping data. Re-request old quotes after this update. No labels are purchased automatically.

### Read-only sandbox rate diagnostics
In Admin > Albums > Store > Shipping management, click Load shipping configuration. The server verifies the staff role first, then reads the most recent test shipment from Shippo using the existing sandbox secret. The admin-only latestTestShipment section shows the original carrier messages, status and rate count. These are not logged or exposed to the public. Do not share any personal information in returned carrier text. Production never queries this diagnostic endpoint. No new secrets, database migration or frontend deployment required.

### Inventory and fulfillment
Apply `migrations/0004_inventory.sql` to both D1 databases before deploying. Default for unconfigured listings is made to order, 2–3 business days; configure every listing as appropriate before opening live sales. Admin > Albums > Store > Inventory and order fulfillment controls available stock, processing window and paid order stages. D1 triggers atomically reserve in-stock items on order creation, release only on canceled pending orders and consume reservations when paid. Abandoned pending checkouts older than one hour are canceled by cron only when safe; processing payments remain reserved. Refunds do not automatically restock. Available stock is not total physical inventory; reload before editing. Orders ship together after the slowest product; transit estimates are separate, not guaranteed delivery dates. Order status and tracking are manual, no automated tracking or email. Sandbox/live inventory settings are separate.

### Domestic CD launch: explicit estimated packaging opt-in
Production storefront routing uses only the exact https://princesstgcreations.pages.dev origin; all previews, local and legacy pages remain sandbox. The merchant may explicitly set SHIPPO_ALLOW_ESTIMATED_CD_PACKAGING=yes for US-only CD sales while SHIPPO_PACKAGING_VERIFIED=no. This does not mark measurements verified and does not enable unverified merchandise profiles. The merchant absorbs any postage shortfall and must weigh/measure the actual package before buying a label. Remove the opt-in after measuring and setting the verified profile. Stripe Tax calculations remain enabled; only configure registrations actually held. Track qualifying sales and registration thresholds. Admin shipping configuration reports verification and estimate acceptance.

The merchant requested launching with those estimates. `wrangler.live.toml` now sets `LIVE_READY=yes` and the domestic CD estimate opt-in, using the existing 7 x 6 inch package estimates. These settings take effect only when that Worker is deployed; private credentials remain in Cloudflare secrets. Apply the additive schema and inventory migration to the live database before deploying. They use `IF NOT EXISTS`, preserve existing records and may be rerun:
```sh
cd workers/cd-store
npx wrangler d1 execute princesstg-cd-orders-live --config wrangler.live.toml --remote --file=schema.sql
npx wrangler d1 execute princesstg-cd-orders-live --config wrangler.live.toml --remote --file=migrations/0004_inventory.sql
npx wrangler deploy --config wrangler.live.toml
```
Check `/config` and `/catalog` from the allowed production origin after deployment, then merge PR #28 to publish the frontend routing. Missing or mismatched credentials still block checkout. A successful Pages preview is separate from a successful live Worker deployment.

### Research & Surveys and Star Coins

`POST /surveys/submit` reuses the existing service account and Firebase project settings. It requires a signed, current token with `email_verified: true` and an active account; site verification exceptions do not qualify. Production saves one real response per account for this study and credits exactly 500 Star Coins, atomically with its completion record. Test mode accepts only explicitly marked test responses and never credits coins. Live mode also accepts marked tests without crediting coins.

Answer documents under `researchSurveys/transgender-public-attitudes-v1/responses` contain no account identifiers, email, IP address, token, or account-to-response reference. Account completion records under `users/{uid}/surveyRewards` and the `users/{uid}/wallets/starCoins` balance contain no answers or response reference. The answer date is day-only. Infrastructure metadata and free text can still identify people; the UI does not claim untraceability. The endpoint does not log submission bodies or identities. Retain platform request logs only as needed for operation and security.

Before publishing the frontend, apply the full `security/firestore.rules` (the supplied rules plus three additive matches) in the correct project, then deploy both existing Workers:

```sh
cd workers/cd-store
npx wrangler deploy --config wrangler.toml
npx wrangler deploy --config wrangler.live.toml
```

No new secrets or D1 migration are required. Existing service-account permissions must allow Firestore document reads and commits. Missing configuration fails closed with a public error code. Preview/legacy/local site origins use the test Worker and require the TEST checkbox. The test survey endpoint accepts HTTPS deployment and branch previews under the configured `SURVEY_PREVIEW_HOST`; changing preview addresses need no configuration edits. Production, checkout and other routes keep their explicit origin allowlists. There is no coin spending or cash value feature in this change.

Normal Pages updates deploy automatically. Run the two Worker deploy commands above when files under `workers/cd-store` or their imported shared modules change. Pull the latest PR branch first; publishing Pages alone does not update the survey save endpoint.

Admin > Surveys reads all responses with staff-only rules, loads pages of 100, and downloads every page, including tests, regardless of the display filter. Each response starts on a new page in one native `.docx`. The public hub is `pages/research-surveys.html`; balances also appear in Profile > Overview.

### Owner Code & Terminal

Admin > Code & Terminal appears only for an active `owner`. The page starts with no command catalog and requests it from `POST /owner/terminal-commands`; the Worker verifies the signed token and current owner role before returning any commands. Regular administrators, members, guests and inactive owners cannot access the endpoint. Removing owner access clears the page. The repository is public, so the command source is not a secret; no credentials or secret values are included.

All copyable commands start from the `PrincessTGMusic` repository root, including config and SQL paths. The page has search and category filters for deployment, Git, local testing, logs, rules, database setup and music maintenance. Copy buttons copy text only; the page does not execute terminal commands.

The owner-only Check survey save action submits an explicitly marked TEST response with no reward and returns a bounded diagnostic containing the failing step, HTTP status and service error code. The same safe fields appear in Worker logs as `Survey save failed`; answer bodies, account IDs, tokens, service credentials and raw provider error messages are excluded. Public survey errors continue to show only their short PTG reference.
