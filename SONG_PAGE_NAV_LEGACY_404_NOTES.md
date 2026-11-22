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
- Static checks passed: **15 checks with one over-broad selector mismatch
  corrected in the test**. Subsequent focused tests: **18/18 passed**.
  Automated code/simulation checks do not replace a manual browser review.

## Deployment order

This is a stacked pull request.

1. Merge **PR #18**.
2. Merge **PR #19**, after confirming its base has been updated to `main`
   if GitHub does not update it automatically.

Do not merge #19 ahead of #18.
