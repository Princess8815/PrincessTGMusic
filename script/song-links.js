
/* ==========================================
   PRINCESSTG UNIVERSAL SONG LINK ROUTER
========================================== */

// Find the song pages folder automatically.
// Works on localhost and GitHub Pages.

const SONG_FOLDER = new URL(
  "../audioPlayer/pages/",
  import.meta.url
);

const SONG_PAGE = new URL(
  "song.html",
  SONG_FOLDER
);

// Files that are not individual song pages.
const EXCLUDED_PAGES = new Set([
  "song",
  "template",
  "index"
]);

// ==========================================
// GENERATE A DYNAMIC SONG URL
// ==========================================

export function songUrl(pageId) {
  const url = new URL(SONG_PAGE.href);

  url.searchParams.set(
    "id",
    String(pageId)
  );

  return url.href;
}

// ==========================================
// EXTRACT ID FROM AN OLD SONG LINK
// ==========================================

function getLegacySongId(href) {
  if (!href) return null;

  try {
    const url = new URL(
      href,
      document.baseURI
    );

    // Only rewrite links on this website.
    if (url.origin !== location.origin) {
      return null;
    }

    const folder = SONG_FOLDER.pathname;

    if (!url.pathname.startsWith(folder)) {
      return null;
    }

    const filename = url.pathname.slice(
      folder.length
    );

    // Ignore nested folders and non-HTML files.
    if (
      filename.includes("/") ||
      !filename.toLowerCase().endsWith(".html")
    ) {
      return null;
    }

    const pageId = decodeURIComponent(
      filename.slice(0, -5)
    );

    if (
      !pageId ||
      EXCLUDED_PAGES.has(pageId.toLowerCase())
    ) {
      return null;
    }

    return pageId;

  } catch (error) {
    console.warn(
      "Could not process song link:",
      href,
      error
    );

    return null;
  }
}

// ==========================================
// CONVERT AN OLD LINK
// ==========================================

function updateSongLink(link) {
  if (!link?.hasAttribute("href")) {
    return;
  }

  const pageId = getLegacySongId(
    link.getAttribute("href")
  );

  if (!pageId) return;

  const newHref = songUrl(pageId);

  if (link.href !== newHref) {
    link.href = newHref;
  }
}

// ==========================================
// SCAN A PAGE FOR SONG LINKS
// ==========================================

function scanSongLinks(root = document) {

  // Process the root itself when it's a link.
  if (
    root.nodeType === 1 &&
    root.matches?.("a[href]")
  ) {
    updateSongLink(root);
  }

  // Process all links inside it.
  root.querySelectorAll?.("a[href]").forEach(
    updateSongLink
  );
}

// ==========================================
// WATCH FOR NEW LINKS
// ==========================================
// Handles album lists and other elements
// inserted dynamically by JavaScript.
// ==========================================

function startSongLinkRouter() {

  // Convert existing links.
  scanSongLinks();

  const observer = new MutationObserver(
    mutations => {

      for (const mutation of mutations) {

        // A link's href was changed.
        if (mutation.type === "attributes") {
          updateSongLink(mutation.target);
          continue;
        }

        // New HTML was added to the page.
        for (const node of mutation.addedNodes) {

          if (node.nodeType !== 1) continue;

          scanSongLinks(node);
        }
      }
    }
  );

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href"]
  });

  console.log(
    "Universal song link router enabled."
  );
}

// ==========================================
// START AUTOMATICALLY
// ==========================================

if (document.readyState === "loading") {

  document.addEventListener(
    "DOMContentLoaded",
    startSongLinkRouter,
    { once: true }
  );

} else {
  startSongLinkRouter();
}
