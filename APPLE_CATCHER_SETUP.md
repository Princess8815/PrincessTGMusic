
# Fruity Paradice / Apple Catcher
- Fresh branch from main; no new Worker or Firebase project.
- Run `node --test workers/cd-store/tests/apple-catcher.test.mjs` plus existing tests.
- Deploy existing live Worker: `cd workers/cd-store && npx wrangler deploy --config wrangler.live.toml`.
- No new Firestore rules needed if the current main rules are published. Uses the existing Worker-only privateGames, owner-read trophies, and axolotl/wallet collections. Do not add Appey or Fruiter to the public encounter allowlist.
- Test with a verified live Firebase account on local/Pages preview or production. Every fresh catch awards one coin, saved in a 15-second batch or at the end of a run. Three lives; missed fresh apples and caught rotten apples consume lives. Difficulty rises every 30 seconds, reducing spawn and fall intervals. Appey rolls once on the 50th catch of each run (1/5). Fruiter rolls per fresh catch with denominator max(500, floor(10000/(1+0.20*level))), where level starts at zero. Orchard Master unlocks at 1,000 catches in one run.
- The deterministic simulation runs in browser and Worker; the Worker replays basket moves, checks elapsed time, and atomically commits coins, game progress and first-time unlocks. This prevents duplicate credits and arbitrary score submission, not bots or automated solvers. Unconfirmed progress can be lost if a tab closes before saving; the last confirmed checkpoint resumes. Toasts chime after browser audio permission (first click/key); existing toast-class DOM notifications are detected by the shared shell. Inline status text is not a toast.
- Manual live, browser and sound testing still required.

- Fullscreen expands the whole game including score, wallet, controls and notifications. Escape or the fullscreen toggle exits; unsupported browser fullscreen falls back to a full-window overlay. Hold either arrow key to move repeatedly, or use A/D, lane buttons, or touch. The canvas scales to the available screen with device-pixel-ratio rendering. Browser testing is required.
