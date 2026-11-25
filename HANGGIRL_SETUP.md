
# Hanggirl release checklist

This feature is intentionally a pull request, not an automatic deployment.
1. Review the PR and run `node --test workers/cd-store/tests/hanggirl.test.mjs` and the existing test suite.
2. Publish the complete `security/firestore.rules` to Firebase project music-and-poetry. Do not add game axolotl IDs to the browser-create allowlist.
3. Deploy the existing live CD Store Worker with `cd workers/cd-store && npx wrangler deploy --config wrangler.live.toml`. The existing FIREBASE_REWARD_SERVICE_ACCOUNT secret and datastore IAM permissions are reused. No Blaze or D1 migration is required.
4. Deploy the site from the merged main branch. The Pages preview/local site uses a small practice word bank and never writes rewards.
5. Use a verified account on the live site for a smoke test: win, refresh, inspect the existing wallet and collection, retry the final letter, and check the balance only increases once. Test concurrent guesses, abandon, and banned accounts. Confirm locked trophies are visible with requirements.

The live Worker retrieves words from Datamuse (https://www.datamuse.com/api/), including frequency metadata, and uses a manually curated fallback when unavailable. Optional DATAMUSE_API_KEY can be set as a Worker secret when the provider requires a key (announced January 2027). No API key is exposed to browsers. Difficulty is heuristic; vocabulary familiarity and filtering are imperfect. Six wrong guesses at all difficulties. A loss/abandonment resets the streak; winning another difficulty starts a different streak. One round is active per account, and refreshing resumes it. Rewards are based on server-side guesses and Firestore atomic commits, not a client-reported win. This blocks direct reward forgery but cannot prevent players using external solvers or automated play. Each guess uses Firestore operations and Worker requests, so monitor Spark/Worker free quotas.

The account's authoritative game document is privateGames/hanggirl (no browser access); the trophy collection is owner-read-only. Earned trophies remain private with the archived account, like the existing wallet. Existing encounter-based axolotls and survey rewards are unchanged. No art files are necessary: new axolotls use existing original SVG portrait system with unique colors and accessories.
