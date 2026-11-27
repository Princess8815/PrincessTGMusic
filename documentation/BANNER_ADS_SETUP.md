# Banner ad integration: phase 1

The AdSense unit is PTG Universal Banner, publisher ca-pub-9671323559975419, slot 8870216368. The existing ads.txt remains unchanged.

## Test before merging
On a local emulator or hosted preview, sign in as an active administrator or owner and visit Admin > Accounts > My membership. Switch to Free: the AD HERE test banner appears directly below the toggle. Switch to Paid: it disappears. On Home, All Songs, Albums, Art & Writing, Poems, Releases, About, and the Games landing page, the same membership state controls a nonsticky test banner. A preview displays the placeholder for guests and confirmed Free accounts; the production hostname displays it only for staff who explicitly select Free view. Paid and unresolved memberships never display it. Checkout, health, surveys, profile, admin pages (except the dedicated demonstration), private tools, and gameplay pages are not public banner locations.

Run `node tests/banner-ads.test.cjs`. This phase uses existing membership rules; no new Firestore rules, Worker, Stripe, or Blaze changes.

## Before activating real ads
Real ads are not implemented or loaded in this phase. Confirm AdSense site approval, disable Auto ads, arrange applicable consent/privacy controls (including a Google-certified CMP where required), review age eligibility, update the privacy notice, and then add an owner-controlled master switch and per-page live configuration. Never reward banner clicks or reload banners to generate impressions. Keep real ad requests off previews/local development and ensure Paid membership suppresses requests, not merely the displayed element. Review gameplay ad placements separately.
