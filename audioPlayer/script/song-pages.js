
import {
  loadSong
} from "../../script/song-data.js";

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
            "Unable to play this audio file."
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
      "Audio availability could not be checked."
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

  const originalLyrics = song.lyrics || "";
  let englishTranslation = null;

  toggle.addEventListener("change", () => {
    lyrics.textContent =
      toggle.checked && englishTranslation !== null
        ? englishTranslation
        : originalLyrics;
  });

  try {
    const response = await fetch(TRANSLATIONS);

    if (!response.ok) return;

    const translations = await response.json();

    const translated = translations?.[song.title];

    if (
      typeof translated !== "string" ||
      !translated.trim()
    ) {
      return;
    }

    englishTranslation = translated;
    toggleContainer.hidden = false;

  } catch (error) {
    console.warn(
      "Translation unavailable:",
      error
    );
  }
}

// ==========================================
// UPDATE PAGE METADATA
// ==========================================

function updateMetadata(song) {
  document.title =
    `${song.title} by PrincessTG`;

  const description =
    song.description ||
    `Listen to ${song.title} by PrincessTG.`;

  const meta = document.querySelector(
    'meta[name="description"]'
  );

  if (meta) {
    meta.content = description;
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
    setText("songAlbum", song.album, "Unknown");
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
      song.releaseDate || "tbd"
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
      "Unable to load this song."
    );
  }
}

initializeSongPage();
