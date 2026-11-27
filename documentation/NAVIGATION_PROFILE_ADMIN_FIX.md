# Site navigation: Profile, Admin and all core pages

This patch fixes the new shared navigation not appearing on some pages.

## Root cause

`pages/profile.html` had a `#auth-container` element but did **not** load `script/auth.js` or `script/site-shell.js`. The entire new sidebar was previously loaded as a static dependency of `auth.js`, which also meant a blocked or slow Firebase module could stop the public navigation from rendering.

## Changes

- **Profile:** now loads authentication UI and the shared sidebar directly, including the desktop sidebar, mobile full-screen hamburger and contact footer.
- **Admin:** now loads the sidebar directly so it does not wait for Firebase. The existing admin page guard and staff-only controls are unchanged.
- **Other core pages:** Home, About, Settings, Releases, Challenges, Accidental Songwriter Challenge, Roadmap, Poetry, Stories, main Music Player, shared song page, Albums index, shared album page, standalone album pages, and story chapters load the navigation script and stylesheet directly.
- **Generated song pages:** current pages continue to receive navigation through the shared `auth.js` import. `audioPlayer/pages/template.html` now includes the direct navigation loader so future regenerations keep it even when Firebase is delayed.
- **Generated legacy albums:** the old `create-album.cjs` templates now include the shell and authentication markup, preserving navigation if those legacy pages are regenerated.
- The navigation script no longer statically imports Firebase. It builds the public menu and footer first, then loads Firebase in the background only to show the verified Profile/Admin links.
- Profile and Admin content gets responsive width rules beside the desktop sidebar and below the mobile menu.

## Security

Profile links are only shown when signed in; the Admin link only appears after confirmed staff status. These link visibility rules do **not** replace Firebase security rules or existing `guardStaffPage` checks.

## Testing

1. Open **Profile** while signed in: verify sidebar at desktop width and hamburger at mobile width.
2. Open **Admin** as a staff account: verify the sidebar and test Music, Albums, Genres and account tabs.
3. Navigate from Profile to Music, then Admin to Settings, then back. All sidebar links should stay functional.
4. Open the mobile menu. Verify the same button opens/closes it, the page remains scrollable inside the menu, and pressing Escape closes it.
5. Sign out: verify Admin and Profile links disappear.
6. Visit the album index, shared album page, legacy album, song details, a generated song, and the story pages.
7. If Firebase is blocked in browser dev tools, public menu destinations and the footer should still render on pages loading `site-shell.js` directly.

Validation: checked direct relative script/CSS paths on the 28 main and legacy HTML pages touched by this fix; simulated the site shell with a fake DOM and verified the menu opened/closed and built 13 links while account links remained hidden. The dynamic navigation JS parses. **A full real-browser regression test against live Firebase was not available in the connector environment.** `create-album.cjs` already has a parse error on `main`; this patch only updates its generated HTML template and does not attempt an unrelated generator repair.

No Firebase rules, Cloud Functions or Blaze changes are needed.
