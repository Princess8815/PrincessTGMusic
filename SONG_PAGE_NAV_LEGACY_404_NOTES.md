# Song page navigation, legacy link notice, and custom 404 (PR #19)

## Active song detail pages

Use the maintained song view:

`audioPlayer/pages/song.html?id=100-voices`

It now loads the same shared desktop sidebar, mobile hamburger, footer, and
site-wide color settings as the rest of PrincessTG Creations. It is independent
of Firebase Authentication availability and preserves audio, lyrics, song
sharing, and playlist interactions.

The old in-page **Back to Song List** navigation was removed from this
maintained route. Use the sidebar's **All Songs** link instead.

## Deprecated individual HTML song URLs

Prior song links, including `audioPlayer/pages/100-voices.html`, remain valid
and keep their original metadata and content. The shared legacy script
(`audioPlayer/script/songlist.js`) now shows a dialog on these URLs with:

- **Open updated song page**: goes to
  `audioPlayer/pages/song.html?id=<original-page-id>`
- **Stay on old page**: dismisses the notice for the current visit.

No forced navigation happens. Opening `song.html?id=...` itself never
displays the deprecation dialog. The notices automatically cover existing
generated legacy HTML pages that already import `songlist.js`; no need to
edit hundreds of pages manually.

If regenerating legacy pages, keep the `songlist.js` import in the template.

## Custom 404

`404.html` lives at the repository root for GitHub Pages. It is
self-contained and needs no Firebase, remote fonts, or image files.

Each load picks **one** of five original illustrated axolotl variants:

- Marina (pink, bow)
- Luna (lavender, star)
- Sprout (mint, leaf)
- Sunny (golden, crown)
- Pearl (blue, seashell)

Only one axolotl appears at a time. The 404 page offers **Redirect now** to
the website home and **Browse songs** to the player. Its links target the
`/PrincessTGMusic/` base on GitHub Pages and `/` on Live Server and custom
domains.

## Verification

- Active page imports the site-shell JS/CSS once; the malformed inline CSS is
  corrected; dynamic song loader retained.
- Two sample legacy pages retain their shared `songlist.js` import, and the
  page generator template also includes it.
- The legacy dialog initializes only for old pages, does not force a
  redirect, produces the correct `song.html?id=...` destination, and
  dismisses on the **Stay** button.
- The 404 page has one SVG axolotl, five randomized design possibilities,
  accessible text, keyboard-accessible navigation, and reduced-motion CSS.
- Static checks confirmed script/style references and fixed CSS nesting.
  Simulated navigation, legacy dialog and all five random 404 variants:
  **18/18 passed**. These tests do not replace a manual browser review.

## Deployment order

This is a stacked pull request.

1. Merge **PR #18**.
2. Merge **PR #19**, after confirming its base has been updated to `main`
   if GitHub does not update it automatically.

Do not merge #19 ahead of #18.


## Test real 404 responses locally (no Live Server needed)

With PR #19 checked out, open the VS Code terminal in the **repository root**:

```cmd
node dev-server.js
```

The script starts its own local HTTP server on `127.0.0.1:5502`, separate
from VS Code Live Server's usual port 5501. Open:

- Home: `http://127.0.0.1:5502/`
- A missing URL: `http://127.0.0.1:5502/something-that-does-not-exist`
- A maintained song: `http://127.0.0.1:5502/audioPlayer/pages/song.html?id=100-voices`
- Old URL warning: `http://127.0.0.1:5502/audioPlayer/pages/100-voices.html`

A missing URL now returns HTTP **404** with the customized, randomized
axolotl art. You can refresh to get a different single axolotl.

Run `node dev-server.js 5503` to use another port. Press **Ctrl+C** in
the server terminal to stop it. No `npm install` or third-party packages
are necessary. Audio playback supports HTTP Range requests for seeking.
Local `/PrincessTGMusic/` links are also recognized.

**Firebase note:** the hostname/port creates a distinct browser origin:
if you selected Live Firebase under Live Server on port 5501, the new
5502 page does not inherit that selection. The site's default on every
new local origin is **emulator mode**. If you are not running both Firebase
emulators, open `http://127.0.0.1:5502/pages/settings.html` and
switch that origin to **Live Firebase**, being mindful that live tests
can change real accounts and data.

Do not expect the VS Code **Go Live** extension itself to display the
custom 404. It has its own missing-page handling. Use the Node server
URL on port 5502 to test this behavior.

### Additional tests

- **12/12 mocked HTTP tests passed:** GET/HEAD responses, real 404 content,
  JavaScript MIME, GitHub Pages prefix, missing-page link, HTTP 405,
  private file blocking, audio Range/206 and invalid range/416.
- Integration testing against a live Node HTTP listener and browser
  navigation remains a manual acceptance step.
