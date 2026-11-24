
import { db } from "./firebase.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

// ==========================================
// DATABASE SETTINGS
// ==========================================

const SONG_COLLECTION = "songs";

const jsonCache = new Map();

// ==========================================
// NORMALIZE SONG IDS
// ==========================================

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function songKey(song) {
  return slugify(song?.pageId || song?.title);
}

// ==========================================
// LOAD ORIGINAL JSON FILE
// ==========================================

async function loadJSON(jsonURL) {
  const url = new URL(
    jsonURL,
    document.baseURI
  ).href;

  if (!jsonCache.has(url)) {
    const promise = fetch(url, {
      cache: "no-store"
    }).then(async response => {

      if (!response.ok) {
        throw new Error(
          `Could not load song JSON: ${response.status}`
        );
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error(
          "Song details JSON must contain an array."
        );
      }

      return data;
    });

    jsonCache.set(url, promise);
  }

  return jsonCache.get(url);
}

// ==========================================
// MERGE TWO SONG OBJECTS
// ==========================================

function mergeSong(jsonSong, databaseSong, id) {
  const merged = {
    ...(jsonSong || {}),
    ...(databaseSong || {}),
    pageId: id
  };
  // JSON can retain a playful human-readable release label while Firestore
  // requires a machine-readable releaseDate (YYYY-MM-DD or "tbd").
  // The explicit displayReleaseDate takes priority over the legacy fallback.
  const original = typeof jsonSong?.releaseDate === "string"
    ? jsonSong.releaseDate.trim() : "";
  const explicitDisplay = typeof jsonSong?.displayReleaseDate === "string"
    ? jsonSong.displayReleaseDate.trim() : "";
  const legacyDisplay = original && original.toLowerCase() !== "tbd"
    && !/^\d{4}-\d{2}-\d{2}$/.test(original) ? original : "";
  const originalDisplay = explicitDisplay || legacyDisplay;
  const databaseDate = typeof databaseSong?.releaseDate === "string"
    ? databaseSong.releaseDate.trim() : "";
  if (originalDisplay &&
      (!databaseSong || !databaseDate || databaseDate.toLowerCase() === "tbd")) {
    merged.displayReleaseDate = originalDisplay;
  } else if (jsonSong && databaseDate &&
             databaseDate.toLowerCase() !== "tbd") {
    // A genuine scheduled date in Firestore overrides an old JSON joke.
    delete merged.displayReleaseDate;
  }
  return merged;
}

// ==========================================
// LOAD ALL SONGS
// ==========================================
// Used by:
// audioPlayer/script/main.js
// script/releases.js
//
// JSON provides existing songs.
// Firestore provides new or updated fields.
// Firestore takes priority.
// ==========================================

export async function loadAllSongs(jsonURL, {strict=false}={}) {

  const [jsonResult, databaseResult] =
    await Promise.allSettled([
      loadJSON(jsonURL),
      (strict ? getDocsFromServer : getDocs)(collection(db, SONG_COLLECTION))
    ]);

  if(strict && (jsonResult.status==="rejected" || databaseResult.status==="rejected")) {
    throw Error("Both song sources must be available before editing albums. Retry.");
  }
  // Neither source worked.
  if (
    jsonResult.status === "rejected" &&
    databaseResult.status === "rejected"
  ) {
    console.error(
      "JSON error:",
      jsonResult.reason
    );

    console.error(
      "Firestore error:",
      databaseResult.reason
    );

    throw new Error(
      "Unable to load songs from either source."
    );
  }

  const songs = new Map();

  // ========================================
  // FIRST LOAD EXISTING JSON SONGS
  // ========================================

  if (jsonResult.status === "fulfilled") {

    for (const song of jsonResult.value) {

      if (!song?.title) continue;

      const id = songKey(song);

      if (!id) continue;

      songs.set(id, {
        ...song,
        pageId: id
      });
    }

  } else {
    console.warn(
      "JSON unavailable:",
      jsonResult.reason
    );
  }

  // ========================================
  // THEN LOAD FIRESTORE SONGS
  // ========================================

  if (databaseResult.status === "fulfilled") {

    databaseResult.value.forEach(snapshot => {

      const id = snapshot.id;
      const key = slugify(id);

      const databaseSong = snapshot.data();
      const jsonSong = songs.get(key);

      // Database fields override JSON fields.
      const merged = mergeSong(
        jsonSong,
        databaseSong,
        id
      );

      if (!merged.title) {
        merged.title = id;
      }

      songs.set(key, merged);
    });

  } else {
    console.warn(
      "Firestore unavailable. Using JSON.",
      databaseResult.reason
    );
  }

  const result = [...songs.values()];

  console.log(
    `Loaded ${result.length} songs from JSON + Firestore.`
  );

  return result;
}

// ==========================================
// LOAD ONE SONG
// ==========================================
// Used by individual song detail pages.
//
// Matches by pageId first.
// Falls back to title when necessary.
// ==========================================

export async function loadSong(
  pageId,
  title,
  jsonURL
) {

  const id = slugify(pageId || title);

  const databaseRequest = id
    ? getDoc(doc(db, SONG_COLLECTION, id))
    : Promise.resolve(null);

  const [jsonResult, databaseResult] =
    await Promise.allSettled([
      loadJSON(jsonURL),
      databaseRequest
    ]);

  // ========================================
  // CHECK SOURCE AVAILABILITY
  // ========================================

  if (
    jsonResult.status === "rejected" &&
    databaseResult.status === "rejected"
  ) {
    throw new Error(
      "Could not load this song."
    );
  }

  // ========================================
  // FIND SONG IN JSON
  // ========================================

  let jsonSong = null;

  if (jsonResult.status === "fulfilled") {

    const songs = jsonResult.value;

    // Find by page ID.
    jsonSong = songs.find(
      song => songKey(song) === id
    ) || null;

    // Fall back to song title.
    if (!jsonSong && title) {

      jsonSong = songs.find(song =>
        String(song?.title || "").toLowerCase() ===
        String(title).toLowerCase()
      ) || null;
    }

  } else {
    console.warn(
      "Song JSON unavailable:",
      jsonResult.reason
    );
  }

  // ========================================
  // FIND SONG IN FIRESTORE
  // ========================================

  let databaseSong = null;

  if (databaseResult.status === "fulfilled") {

    const snapshot = databaseResult.value;

    if (snapshot?.exists()) {
      databaseSong = snapshot.data();
    }

  } else {
    console.warn(
      "Firestore song unavailable:",
      databaseResult.reason
    );
  }

  // ========================================
  // MERGE BOTH SOURCES
  // ========================================

  if (!jsonSong && !databaseSong) {
    return null;
  }

  const merged = mergeSong(
    jsonSong,
    databaseSong,
    id
  );

  if (!merged.title) {
    merged.title = title || id;
  }

  return merged;
}
