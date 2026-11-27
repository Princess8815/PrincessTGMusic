# Banner ad integration: phase 1

The AdSense unit is PTG Universal Banner, publisher ca-pub-9671323559975419, slot 8870216368. The existing ads.txt remains unchanged.

## Test before merging
On a local emulator or hosted preview, sign in as an active administrator or owner and visit Admin > Accounts > My membership. Switch to Free: the AD HERE test banner appears directly below the toggle. Switch to Paid: it disappears. The same membership state controls one nonsticky mock banner per eligible page: Home between streaming and albums; browse pages near the intro or between music playback and catalog; individual album/song/chapter pages below content; all seven games below their entire game area; all four storefronts below shopping content; and challenges below their content. Checkout/receipt states and modal dialogs suppress the placeholder, as does focus within a challenge form. A preview displays the placeholder for guests and confirmed Free accounts; the production hostname displays it only for staff who explicitly select Free view. Paid and unresolved memberships never display it. Health, surveys, profile, admin pages (except the dedicated demonstration), documents including shared readers, settings, legal pages, game editors, errors and 404 are excluded. Gameplay has only an out-of-game-area banner, not an in-game interruption.

Run `node tests/banner-ads.test.cjs`. This phase uses existing membership rules; no new Firestore rules, Worker, Stripe, or Blaze changes.

## Before activating real ads
Real ads are not implemented or loaded in this phase. Confirm AdSense site approval, disable Auto ads, arrange applicable consent/privacy controls (including a Google-certified CMP where required), review age eligibility, update the privacy notice, and then add an owner-controlled master switch and per-page live configuration. Never reward banner clicks or reload banners to generate impressions. Keep real ad requests off previews/local development and ensure Paid membership suppresses requests, not merely the displayed element. Review gameplay ad placements separately.

## Troubleshooting
If banners do not appear, confirm the current branch is deployed and Admin > Accounts reports Free (not Paid or Unavailable). The auth dialog exists in the DOM even when its outer wrapper is hidden: only a visibly rendered dialog suppresses a mock banner. On localhost, use the same Firebase environment and account as the membership toggle. Production mock banners remain restricted to staff testing Free; guests and normal Free users can test on previews.
