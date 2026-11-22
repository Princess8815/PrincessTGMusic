# PrincessTG Creations: shared navigation and tabbed pages

This branch introduces a shared layout for the existing GitHub Pages site. **It does not change your Firebase data, require Blaze, or replace the working player/admin/profile scripts.**

## Navigation

Desktop: a fixed categorized sidebar on the **left** with sections for Explore, Music, Create & Discover, and Account.

Mobile (850px and smaller): a top-left hamburger opens a **full-screen scrolling menu**. The same button closes it, and Escape closes it from the keyboard. A trapped keyboard tab cycle prevents focus from escaping the open menu.

Navigation destinations:
- Home, About Me, Development Roadmap
- All Songs, Albums, Releases
- Songwriter Challenges, Accidental Songwriter Challenge
- Poetry, Stories
- My Profile (only when signed in), Admin Panel (only after Firebase confirms staff role)
- Settings (available to everyone)

The old Profile and Admin buttons in the top auth bar are hidden once the new layout has loaded. Sign In/Register and Log Out remain in the top bar. **Server-side Firebase rules and staff page guards remain the actual access controls**; hiding a link is not a security boundary.

## Footer

A compact footer automatically shows icons for the same Facebook, TikTok, Instagram, LinkedIn, Medium, X, and email contact destinations that were present on the original home page. The old oversized home contact grid is removed when the shared footer is constructed.

Core pages gain the layout automatically via `script/auth.js`, which now imports `script/site-shell.js`. Legacy story pages and the older Hope album page previously lacked authentication bootstrap; this branch adds it to those pages. There is no need to hand-edit hundreds of already-authenticated song pages.

## Tabs

- Home: **Listen**, **Albums**, **Discover**.
- About Me: **My Story**, **Interests**, **My Music**, **My Message**, **Creative Work**, **What's Ahead**.

The existing contents remain intact. JavaScript rearranges the original sections into accessible tabs, with ArrowLeft/ArrowRight, Home, and End key navigation and shareable hashes such as `#home-albums` or `#about-creative`. Without JavaScript, the original content sections are still present.

## Settings

`pages/settings.html` allows visitors to select accent color (violet, rose, teal), normal or larger text, higher contrast for navigation/footer, and reduced animation. Settings save to **localStorage on the current browser**, not to Firebase or the user account. Reset to Defaults restores initial settings.

## Testing before merging

1. In Live Server, open the homepage and confirm the sidebar, tabs, and compact footer.
2. Open all major pages from the sidebar, including music, albums, releases, challenges, poetry, stories, roadmap and About Me.
3. Test the menu on a phone-sized viewport. It should take over the screen; the hamburger closes it, and Escape also works.
4. Switch Home and About tabs, reload with a tab hash, and use keyboard arrows.
5. Sign in. My Profile should appear in the sidebar; Admin Panel should appear only for a verified admin/owner. Confirm login/logout buttons still work.
6. Open Settings and test each preference and Reset.
7. Open an older generated song page, a static album page, and Herobrine chapter. Confirm they all have the sidebar and footer.
8. Verify playback, generated song links, album track ordering, and the admin panel still work.

**Limitations:** The static shell has been checked for syntax and markup wiring, but end-to-end behavior has **not** been verified in a live browser here. The 217 generated song pages were not audited individually; checked examples already load `script/auth.js`. Existing old back links are visually hidden or removed, but retained where needed for no-JavaScript fallback. External social icons load from simpleicons.org; if that external image service is unavailable, those icons may not appear.
