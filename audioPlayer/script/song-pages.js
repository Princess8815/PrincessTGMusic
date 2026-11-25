import {publicError} from "../../script/site-errors.js";
import {songAlbums} from "../../script/song-albums.js";

import {
  loadSong
} from "../../script/song-data.js";
import {addToPlaylistControl, keyForSong, getAudioIndex} from "../../script/music-playlists.js";

// ==========================================
// PAGE SETTINGS
// ==========================================

const SONG_JSON = "../audio/song-details.json";
const AUDIO_INDEX = "../audio/index.json";
const TRANSLATIONS = "../../data/translation.json";

// ==========================================
// ELEMENT HELPERS
// ==========================================

const $ = id => document.getElementById(id);

function setText(id, value, fallback = "") {
  const element = $(id);

  if (element) {
    element.textContent = value ?? fallback;
  }
}

// ==========================================
// NORMALIZE AUDIO FILE NAMES
// ==========================================

function fileKey(path) {
  let name = String(path || "")
    .split(/[\\/]/)
    .pop()
    .split(/[?#]/)[0];

  try {
    name = decodeURIComponent(name);
  } catch {
    // Keep the original file name.
  }

  return name
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ==========================================
// LOAD AUDIO IF AVAILABLE
// ==========================================


async function setupAudio(song) {
  const audioSection = $("audioSection");
  const player = $("songPlayer");
  const notice = $("audioNotice");
  const noticeSection = $("audioNoticeSection");

  // ==========================================
  // SHOW OR HIDE AUDIO NOTICE
  // ==========================================

  function showAudioNotice(message) {
    notice.textContent = message;
    noticeSection.hidden = !message;
  }

  showAudioNotice("Checking audio availability...");

  try {
    const response = await fetch(AUDIO_INDEX, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Audio index unavailable.");
    }

    const index = await response.json();

    if (!Array.isArray(index)) {
      throw new Error("Invalid audio index.");
    }

    const wantedFile = fileKey(
      song.file || song.title
    );

    const matchingEntry = index.find(item => {
      const path =
        typeof item === "string"
          ? item
          : item?.file || item?.path || item?.src;

      return fileKey(path) === wantedFile;
    });

    // ==========================================
    // SONG IS NOT PLAYABLE ON THE WEBSITE
    // ==========================================

    if (!matchingEntry) {
      showAudioNotice(
        song.file
          ? "This song is not available for on-site playback. Please use a streaming platform if it has been released."
          : "No audio file has been attached to this song yet."
      );

      return;
    }

    // ==========================================
    // SONG IS PLAYABLE
    // ==========================================

    const indexedPath =
      typeof matchingEntry === "string"
        ? matchingEntry
        : matchingEntry.file ||
          matchingEntry.path ||
          matchingEntry.src;

    // The index uses paths such as:
    // audio/BREAKPOINT.mp3

    const cleanPath = indexedPath.replace(
      /^(?:\.\.\/|\.\/|\/)+/g,
      ""
    );

    player.src = new URL(
      "../" + cleanPath,
      document.baseURI
    ).href;

    audioSection.hidden = false;

    // Hide the notice entirely when audio is available.
    showAudioNotice("");

    // ==========================================
    // PLAY BUTTON
    // ==========================================

    $("playSong").addEventListener(
      "click",
      async () => {
        try {
          await player.play();
        } catch (error) {
          console.error(
            "Audio playback failed:",
            error
          );

          showAudioNotice(
            publicError(error,"PTG-502")
          );
        }
      }
    );

    // ==========================================
    // STOP BUTTON
    // ==========================================

    $("stopSong").addEventListener(
      "click",
      () => {
        player.pause();
        player.currentTime = 0;
      }
    );

  } catch (error) {
    console.error("Audio check failed:", error);

    showAudioNotice(
      publicError(error,"PTG-501")
    );
  }
}


// ==========================================
// LOAD ENGLISH TRANSLATION
// ==========================================


async function setupTranslation(song) {
  const toggleContainer = $(
    "translationToggleContainer"
  );

  const toggle = $("translationToggle");
  const lyrics = $("songLyrics");

const lyricsPanel = lyrics?.closest("details");

function syncLyricsCollapse(showTranslation = false) {
  if (!lyricsPanel) return;

  lyricsPanel.open = showTranslation
    ? song.translationCollapsed === false
    : song.lyricsCollapsed === false;
}

syncLyricsCollapse();


  const originalLyrics = song.lyrics || "";

  let englishTranslation = null;

  toggle.checked = false;
  toggleContainer.hidden = true;

  // ========================================
  // FIRST: FIRESTORE TRANSLATION
  // ========================================

  if (typeof song.translation === "string") {
    englishTranslation = song.translation;

  } else {

    // ======================================
    // SECOND: LEGACY JSON TRANSLATION
    // ======================================

    try {
      const response = await fetch(TRANSLATIONS);

      if (response.ok) {
        const translations = await response.json();

        const match = Object.keys(translations).find(
          key =>
            key.toLowerCase() ===
            String(song.title).toLowerCase()
        );

        if (
          match &&
          typeof translations[match] === "string"
        ) {
          englishTranslation = translations[match];
        }
      }

    } catch (error) {
      console.warn(
        "Translation unavailable:",
        error
      );
    }
  }

  // ========================================
  // SHOW TRANSLATION TOGGLE
  // ========================================

  if (
    typeof englishTranslation !== "string" ||
    !englishTranslation.trim()
  ) {
    lyrics.textContent = originalLyrics;
    return;
  }

  toggleContainer.hidden = false;


toggle.addEventListener("change", () => {
  lyrics.textContent = toggle.checked
    ? englishTranslation
    : originalLyrics;

  syncLyricsCollapse(toggle.checked);
});


  lyrics.textContent = originalLyrics;
}


// ==========================================
// UPDATE PAGE METADATA
// ==========================================


function updateMetadata(song) {
  const title = song.title || "Unknown Song";

  const pageTitle = `${title} | PrincessTG Music`;

  const description =
    song.description ||
    `Listen to ${title} by PrincessTG.`;

  // Browser tab title
  document.title = pageTitle;

  // Standard SEO description
  let meta = document.querySelector(
    'meta[name="description"]'
  );

  if (meta) {
    meta.setAttribute("content", description);
  }

  // Open Graph and social metadata
  const metadata = {
    "og:title": pageTitle,
    "og:description": description,
    "og:type": "music.song",
    "og:url": window.location.href
  };

  for (const [property, content] of Object.entries(metadata)) {
    let element = document.querySelector(
      `meta[property="${property}"]`
    );

    if (!element) {
      element = document.createElement("meta");
      element.setAttribute("property", property);
      document.head.appendChild(element);
    }

    element.setAttribute("content", content);
  }

  // Twitter/X metadata
  const twitterTitle = document.querySelector(
    'meta[name="twitter:title"]'
  );

  if (twitterTitle) {
    twitterTitle.content = pageTitle;
  }
}


// ==========================================
// MAIN PAGE LOADER
// ==========================================

async function initializeSongPage() {
  const params = new URLSearchParams(
    window.location.search
  );

  const pageId = params.get("id");

  if (!pageId) {
    setText("songTitle", "Song Not Found");
    setText("songStatus",publicError(null,"PTG-008"));
    setText(
      "songStatus",
      "No song ID was provided."
    );

    return;
  }

  try {
    // ======================================
    // LOAD JSON + FIRESTORE SONG DETAILS
    // ======================================

    const song = await loadSong(
      pageId,
      "",
      SONG_JSON
    );

    if (!song) {
      setText("songTitle", "Song Not Found");
    setText("songStatus",publicError(null,"PTG-008"));
      setText(
        "songStatus",
        "This song does not exist."
      );

      return;
    }

    // ======================================
    // POPULATE THE PAGE
    // ======================================

    setText("songTitle", song.title);
    setText("songDescription", song.description);
    setText("songAlbum", songAlbums(song).join(", "), "Unknown");
    setText(
      "songGenre",
      song.genre ||
        (Array.isArray(song.genres)
          ? song.genres.join(", ")
          : song.genres) ||
        "Uncategorised"
    );

    setText(
      "songDate",
      song.displayReleaseDate || song.releaseDate || "tbd"
    );

    setText(
      "songBy",
      song.submittedBy?.username || "PrincessTG"
    );

    setText(
      "songLyrics",
      song.lyrics || "No lyrics available."
    );

    setText("songStatus", "Song details");

    updateMetadata(song);
    setupSongSharing(song, pageId);
    const playlistActions = $("song-playlist-actions");
    if (playlistActions) {
      const picker=addToPlaylistControl(
        async () => [keyForSong(song, await getAudioIndex().catch(() => []))]
      );
      const send=document.createElement("a");
      send.className="mail-song-link";
      send.textContent="✉ Send by site mail";
      const destination=new URL("../../pages/profile.html",import.meta.url);
      destination.searchParams.set("mailSong","song:"+pageId);
      destination.searchParams.set("mailTitle",String(song.title||pageId));
      destination.hash="tab-mail";
      send.href=destination.href;
      send.style.cssText="display:inline-flex;align-items:center;min-height:38px;padding:8px 12px;margin-left:10px;border-radius:9px;border:1px solid var(--ptg-border,#74608e);text-decoration:none;font-weight:700";
      playlistActions.replaceChildren(picker,send);
    }


    // ======================================
    // LOAD OPTIONAL FEATURES
    // ======================================

    await Promise.all([
      setupAudio(song),
      setupTranslation(song)
    ]);

  } catch (error) {
    console.error(
      "Unable to load song page:",
      error
    );

    setText("songTitle", "Loading Error");
    setText(
      "songStatus",
      publicError(error,"PTG-501")
    );
  }
}


/* ==========================================
   PRINCESSTG MUSIC SONG SHARING
========================================== */

function setupSongSharing(song, pageId) {

  // ========================================
  // CLOUDFLARE SHARING SERVICE
  // ========================================

  const SHARE_BASE =
    "https://princesstg-song-share.transgirl1991.workers.dev";

  const songId = String(
    song.pageId || pageId
  ).trim();

  const shareURL =
    `${SHARE_BASE}/song/${encodeURIComponent(songId)}`;

  // ========================================
  // ELEMENTS
  // ========================================

  const shareButton = $("shareSongButton");
  const copyLinkButton = $("copySongLinkButton");
  const copyPostButton = $("copySongPostButton");

  const messageInput = $("songShareMessage");
  const status = $("songShareStatus");

  if (
    !shareButton ||
    !copyLinkButton ||
    !copyPostButton ||
    !messageInput ||
    !status
  ) {
    console.warn("Song sharing elements missing.");
    return;
  }

  // ========================================
  // DEFAULT SHARING MESSAGE
  // ========================================

  messageInput.value =
    `Check out "${song.title}" on PrincessTG Music!`;

  function getMessage() {
    return messageInput.value.trim();
  }

  function getFullPost() {
    return [
      getMessage(),
      shareURL
    ].filter(Boolean).join("\n\n");
  }

  function showStatus(message) {
    status.textContent = message;
  }

  // ========================================
  // COPY TEXT TO CLIPBOARD
  // ========================================

  async function copyText(text) {

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable.");
      }

      await navigator.clipboard.writeText(text);

      return true;

    } catch (error) {

      // Fallback if clipboard access is blocked.
      window.prompt(
        "Copy this text:",
        text
      );

      return false;
    }
  }

  // ========================================
  // OPEN NATIVE SHARING MENU
  // ========================================

  shareButton.addEventListener(
    "click",
    async () => {

      const shareData = {
        title: `${song.title} | PrincessTG Music`,
        url: shareURL
      };

      const message = getMessage();

      if (message) {
        shareData.text = message;
      }

      // ====================================
      // USE DEVICE SHARE MENU IF AVAILABLE
      // ====================================

      if (typeof navigator.share === "function") {

        try {
          await navigator.share(shareData);

          showStatus(
            "Sharing menu closed."
          );

          return;

        } catch (error) {

          // User canceled sharing.
          if (error.name === "AbortError") {
            showStatus("");
            return;
          }

          console.warn(
            "Native sharing unavailable:",
            error
          );
        }
      }

      // ====================================
      // FALLBACK: COPY MESSAGE AND LINK
      // ====================================

      const copied = await copyText(
        getFullPost()
      );

      showStatus(
        copied
          ? "Sharing menu unavailable. Message and link copied!"
          : "Use the copy dialog to copy your message and link."
      );
    }
  );

  // ========================================
  // COPY LINK ONLY
  // ========================================

  copyLinkButton.addEventListener(
    "click",
    async () => {

      const copied = await copyText(shareURL);

      showStatus(
        copied
          ? "Song link copied!"
          : "Use the copy dialog to copy the link."
      );
    }
  );

  // ========================================
  // COPY MESSAGE AND LINK
  // ========================================

  copyPostButton.addEventListener(
    "click",
    async () => {

      const copied = await copyText(
        getFullPost()
      );

      showStatus(
        copied
          ? "Message and song link copied!"
          : "Use the copy dialog to copy your post."
      );
    }
  );

}


initializeSongPage();
