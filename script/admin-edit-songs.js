
import { auth, db } from "./firebase.js";

import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

import { verifyStaff } from "./staff-auth.js";
import { cleanLyrics } from "./song-lyrics.js";

// ==========================================
// DATABASE SETTINGS
// ==========================================

const JSON_URL =
  "../audioPlayer/audio/song-details.json";

const MAX_RESULTS = 60;
const TRANSLATION_JSON = "../data/translation.json";

// ==========================================
// HELPERS
// ==========================================

function normalize(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

function slugify(text) {
  return normalize(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "song";
}

function getUsername(user) {
  return (
    user?.displayName?.trim() ||
    user?.email ||
    "Administrator"
  ).slice(0, 150);
}

function getGenre(song) {
  if (typeof song.genre === "string") {
    return song.genre.trim();
  }

  if (Array.isArray(song.genre)) {
    return String(song.genre[0] ?? "").trim();
  }

  if (Array.isArray(song.genres)) {
    return String(song.genres[0] ?? "").trim();
  }

  if (typeof song.genres === "string") {
    return song.genres.split(",")[0].trim();
  }

  return "";
}

function missingLyrics(song) {
  const lyrics = cleanLyrics(
    typeof song.lyrics === "string"
      ? song.lyrics
      : ""
  ).toLowerCase();

  return !lyrics ||
    lyrics === "n/a" ||
    lyrics === "tbd";
}

// ==========================================
// INITIALIZE SONG EDITOR
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {

  const $ = id => document.getElementById(id);

  const search = $("edit-song-search");
  const results = $("edit-song-results");
  const searchStatus = $("edit-search-status");

  const editor = $("edit-song-form");
  const source = $("edit-song-source");

  const songIdInput = $("edit-song-id");
  const titleInput = $("edit-song-title");
  const descriptionInput = $("edit-song-description");
  const albumSelect = $("edit-song-album");
  const originalAlbum = $("edit-original-album");

  const genreSelect = $("edit-song-genre");

  const releaseInput = $("edit-song-release");
  const originalDate = $("edit-original-date");

  const submittedByInput =
    $("edit-song-submitted-by");

  const audioInput = $("edit-song-audio");
  const lyricsInput = $("edit-song-lyrics");

  // ========================================
  // ENGLISH TRANSLATION CONTROLS
  // ========================================

  const translationCheckbox = $("edit-has-translation");
  const translationContainer = $("edit-translation-container");
  const translationInput = $("edit-song-translation");

  function syncEditTranslation() {
    const enabled = translationCheckbox.checked;

    translationContainer.hidden = !enabled;
    translationInput.disabled = !enabled;
    translationInput.required = enabled;
  }

  translationCheckbox.addEventListener(
    "change",
    syncEditTranslation
  );

  syncEditTranslation();


  const saveButton = $("edit-song-save");
  const saveStatus = $("edit-song-save-status");

  const buttons = {
    all: $("edit-filter-all"),
    noLyrics: $("edit-filter-no-lyrics"),
    noDatabase: $("edit-filter-no-db"),
    either: $("edit-filter-either")
  };

  const refreshButton = $("edit-refresh-songs");

  if (!search || !results || !editor) return;

  // ========================================
  // STATE
  // ========================================

  let allSongs = [];
  let databaseIds = new Set();
  let albumNames = [];
  let legacyTranslations = {};
let originalTitlesById = new Map();

  // Match translations by original song title,
  // ignoring capitalization differences.

  function findLegacyTranslation(...titles) {
    for (const title of titles) {
      if (!title) continue;

      if (
        typeof legacyTranslations[title] === "string"
      ) {
        return legacyTranslations[title];
      }

      const matchingKey = Object.keys(
        legacyTranslations
      ).find(key =>
        normalize(key) === normalize(title)
      );

      if (
        matchingKey &&
        typeof legacyTranslations[matchingKey] === "string"
      ) {
        return legacyTranslations[matchingKey];
      }
    }

    return "";
  }


  let activeFilter = "all";

  let selectedSongId = null;
  let selectedExistsInDatabase = false;
  let invalidLegacyDate = null;

  function showSaveStatus(message, error = false) {
    saveStatus.textContent = message;
    saveStatus.style.color =
      error ? "#fca5a5" : "#86efac";
  }

  function isInDatabase(song) {
    return databaseIds.has(song.pageId);
  }

  // ========================================
  // VERIFY ADMIN ACCESS
  // ========================================

  try {
    const authorized = await verifyStaff();

    if (!authorized) {
      searchStatus.textContent =
        "Administrator permissions required.";
      return;
    }
  } catch (error) {
    console.error(error);

    searchStatus.textContent =
      "Could not verify administrator access.";

    return;
  }

  // ========================================
  // LOAD JSON AND FIRESTORE SONGS
  // ========================================
  // Firestore fields override JSON fields.
  // JSON-only songs remain searchable.
  // ========================================

  async function loadCatalog() {
    searchStatus.textContent =
      "Loading JSON and Firestore songs...";

    const [jsonResponse, databaseSnapshot] =
      await Promise.all([
        fetch(JSON_URL, { cache: "no-store" }),

        getDocsFromServer(
          collection(db, "songs")
        )
      ]);

    if (!jsonResponse.ok) {
      throw new Error(
        "Unable to load song-details.json."
      );
    }

    const jsonSongs = await jsonResponse.json();

    // ======================================
    // LOAD LEGACY TRANSLATION.JSON
    // ======================================

    const translationResponse = await fetch(
      TRANSLATION_JSON,
      { cache: "no-store" }
    );

    if (!translationResponse.ok) {
      throw new Error(
        "Unable to load data/translation.json."
      );
    }

    const translationData =
      await translationResponse.json();

    if (
      !translationData ||
      typeof translationData !== "object" ||
      Array.isArray(translationData)
    ) {
      throw new Error(
        "translation.json must contain a title-to-text object."
      );
    }

    legacyTranslations = translationData;


    if (!Array.isArray(jsonSongs)) {
      throw new Error(
        "Song JSON must contain an array."
      );
    }

    const songMap = new Map();
    originalTitlesById = new Map();

    // ======================================
    // FIRST: LEGACY JSON RECORDS
    // ======================================

    for (const song of jsonSongs) {
      if (!song || !song.title) continue;

      const id = String(
        song.pageId || slugify(song.title)
      ).trim();

      originalTitlesById.set(id, song.title);
      songMap.set(id, {
        ...song,
        pageId: id
      });
    }

    // ======================================
    // SECOND: FIRESTORE OVERRIDES
    // ======================================

    databaseIds = new Set();

    for (const document of databaseSnapshot.docs) {
      const id = document.id;

      databaseIds.add(id);

      songMap.set(id, {
        ...(songMap.get(id) || {}),
        ...document.data(),
        pageId: id
      });
    }

    allSongs = [...songMap.values()]
      .filter(song =>
        typeof song.title === "string" &&
        song.title.trim()
      )
      .sort((a, b) =>
        a.title.localeCompare(b.title, undefined, {
          sensitivity: "base",
          numeric: true
        })
      );

    renderResults();
  }

  // ========================================
  // FILTER SONGS
  // ========================================

  function matchesFilter(song) {
    const noLyrics = missingLyrics(song);
    const noDatabase = !isInDatabase(song);

    switch (activeFilter) {

      case "noLyrics":
        return noLyrics;

      case "noDatabase":
        return noDatabase;

      case "either":
        return noLyrics || noDatabase;

      default:
        return true;
    }
  }

  function setFilter(filter) {
    activeFilter = filter;

    for (const [name, button] of
      Object.entries(buttons)) {

      if (!button) continue;

      button.classList.toggle(
        "active",
        name === filter
      );
    }

    renderResults();
  }

  // ========================================
  // LIVE SEARCH RESULTS
  // ========================================

  function renderResults() {

    const query = normalize(search.value);

    const filtered = allSongs.filter(song => {

      const titleMatches = normalize(
        song.title
      ).includes(query);

      return titleMatches && matchesFilter(song);
    });

    const fragment =
      document.createDocumentFragment();

    for (const song of filtered.slice(0, MAX_RESULTS)) {

      const item = document.createElement("li");
      const button = document.createElement("button");

      button.type = "button";

      const name = document.createElement("strong");
      name.textContent = song.title;

      const note = document.createElement("span");
      note.className = "edit-result-note";

      const labels = [];

      if (!isInDatabase(song)) {
        labels.push("Not in Firestore");
      } else {
        labels.push("In Firestore");
      }

      if (missingLyrics(song)) {
        labels.push("Missing lyrics");
      }

      note.textContent = labels.join(" • ");

      button.append(name, note);

      button.addEventListener("click", () => {
        selectSong(song.pageId);
      });

      item.appendChild(button);
      fragment.appendChild(item);
    }

    results.replaceChildren(fragment);

    const missingCount =
      allSongs.filter(missingLyrics).length;

    const notInDatabaseCount =
      allSongs.filter(song =>
        !isInDatabase(song)
      ).length;

    searchStatus.textContent =
      `${filtered.length} matches` +
      (filtered.length > MAX_RESULTS
        ? ` (showing first ${MAX_RESULTS})`
        : "") +
      ` | ${missingCount} missing lyrics` +
      ` | ${notInDatabaseCount} not in Firestore`;
  }

  search.addEventListener(
    "input",
    renderResults
  );

  buttons.all.addEventListener(
    "click",
    () => setFilter("all")
  );

  buttons.noLyrics.addEventListener(
    "click",
    () => setFilter("noLyrics")
  );

  buttons.noDatabase.addEventListener(
    "click",
    () => setFilter("noDatabase")
  );

  buttons.either.addEventListener(
    "click",
    () => setFilter("either")
  );

  refreshButton.addEventListener(
    "click",
    async () => {
      try {
        await loadCatalog();
      } catch (error) {
        searchStatus.textContent =
          `Refresh failed: ${error.message}`;
      }
    }
  );

  // ========================================
  // LOAD CURRENT ALBUM ENUM
  // ========================================

  async function loadAlbumNames() {
    const snapshot = await getDocFromServer(
      doc(db, "enums", "albums")
    );

    if (!snapshot.exists()) {
      throw new Error(
        "Missing enums/albums document."
      );
    }

    const values = snapshot.data().values;

    if (!Array.isArray(values)) {
      throw new Error(
        "Album enum must contain a values array."
      );
    }

    albumNames = [
      ...new Set(
        values.filter(
          album =>
            typeof album === "string" &&
            album.trim()
        ).map(album => album.trim())
      )
    ].sort((a, b) => a.localeCompare(b));
  }

  // ========================================
  // POPULATE ALBUM DROPDOWN
  // ========================================

  function populateAlbumDropdown(currentAlbum) {
    albumSelect.replaceChildren(
      new Option("N/A - Select Album", "")
    );

    for (const album of albumNames) {
      albumSelect.add(
        new Option(album, album)
      );
    }

    const existing = albumNames.find(
      album =>
        normalize(album) ===
        normalize(currentAlbum)
    );

    if (existing) {
      albumSelect.value = existing;
      originalAlbum.textContent = "";
    } else {
      albumSelect.value = "";

      originalAlbum.textContent =
        currentAlbum
          ? `Current album "${currentAlbum}" is not in the enum. Select a new album.`
          : "No album assigned. Select an album.";
    }
  }

  // ========================================
  // POPULATE GENRE DROPDOWN
  // ========================================
  // Copies options from the working Add Song
  // genre dropdown so both use the same list.
  // ========================================

  function populateGenreDropdown(currentGenre) {

    const addSongGenre =
      document.getElementById("song-genre");

    const genreOptions = new Map();

    for (const option of
      Array.from(addSongGenre?.options || [])) {

      if (!option.value.trim()) continue;

      genreOptions.set(option.value, {
        value: option.value,
        label: option.textContent.trim()
      });
    }

    const globalGenres =
      window.PrincessTGGenres;

    if (Array.isArray(globalGenres)) {
      for (const genre of globalGenres) {
        if (typeof genre !== "string") continue;

        genreOptions.set(genre, {
          value: genre,
          label: genre
        });
      }
    }

    genreSelect.replaceChildren(
      new Option("Select Genre", "")
    );

    for (const option of genreOptions.values()) {
      genreSelect.add(
        new Option(
          option.label,
          option.value
        )
      );
    }

    // Preserve a legacy genre even if it
    // isn't in the current genre list.
    if (
      currentGenre &&
      !genreOptions.has(currentGenre)
    ) {
      genreSelect.add(
        new Option(
          `${currentGenre} (existing)`,
          currentGenre
        )
      );
    }

    genreSelect.value = currentGenre || "";
  }

  // ========================================
  // OPEN SELECTED SONG
  // ========================================

  async function selectSong(id) {
    const cached = allSongs.find(
      song => song.pageId === id
    );

    if (!cached) return;

    editor.hidden = true;
    selectedSongId = null;

    searchStatus.textContent =
      `Loading "${cached.title}"...`;

    try {
      const [snapshot] = await Promise.all([
        getDocFromServer(
          doc(db, "songs", id)
        ),
        loadAlbumNames()
      ]);

      selectedExistsInDatabase =
        snapshot.exists();

      const song = snapshot.exists()
        ? {
            ...cached,
            ...snapshot.data(),
            pageId: id
          }
        : cached;

      selectedSongId = id;

      // ====================================
      // POPULATE TEXT FIELDS
      // ====================================

      songIdInput.value = id;

      titleInput.value = song.title || "";

      descriptionInput.value =
        song.description || "";

      populateAlbumDropdown(
        song.album || ""
      );

      const genre = getGenre(song);

      populateGenreDropdown(genre);

      lyricsInput.value =
        typeof song.lyrics === "string"
          ? song.lyrics
          : "";


      // ====================================
      // DETECT EXISTING ENGLISH TRANSLATION
      // ====================================

      const originalTitle =
        originalTitlesById.get(id) || song.title;

      const jsonTranslation = findLegacyTranslation(
        originalTitle,
        song.title
      );

      // Firestore takes priority over JSON.
      // An empty Firestore string means the
      // translation was intentionally disabled.

      const currentTranslation =
        typeof song.translation === "string"
          ? song.translation
          : jsonTranslation;

      // Populate the translation textarea.
      translationInput.value = currentTranslation;

      // Automatically activate the checkbox
      // when a translation is present.
      translationCheckbox.checked =
        currentTranslation.trim().length > 0;

      // Show or hide the textarea.
      syncEditTranslation();


      // ====================================
      // RELEASE DATE
      // ====================================

      const existingDate = String(
        song.releaseDate || ""
      ).trim();

      const isISODate =
        /^\d{4}-\d{2}-\d{2}$/.test(existingDate);

      releaseInput.value = isISODate
        ? existingDate
        : "";

      invalidLegacyDate =
        existingDate &&
        existingDate.toLowerCase() !== "tbd" &&
        !isISODate
          ? existingDate
          : null;

      originalDate.textContent =
        invalidLegacyDate
          ? `Original date: "${invalidLegacyDate}". Select a valid date before saving.`
          : "Blank saves as tbd.";

      // ====================================
      // DISPLAY AUTHOR AND AUDIO REFERENCE
      // ====================================

      submittedByInput.value =
        song.submittedBy?.username ||
        "N/A (legacy song)";

      audioInput.value =
        song.audio?.storagePath ||
        song.file ||
        "No audio reference in song details";

      // ====================================
      // DISPLAY DATABASE SOURCE
      // ====================================

      source.textContent =
        selectedExistsInDatabase
          ? "Source: Firestore, with JSON fallback where available."
          : "Source: JSON only. Saving will import this song into Firestore.";

      showSaveStatus("");

      editor.hidden = false;

      searchStatus.textContent =
        `Editing: ${song.title}`;

      editor.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

    } catch (error) {
      console.error(
        "Failed to load selected song:",
        error
      );

      searchStatus.textContent =
        `Could not load song: ${error.message}`;
    }
  }

  // ========================================
  // SAVE EDITED SONG
  // ========================================

  editor.addEventListener("submit", async event => {
    event.preventDefault();

    if (!selectedSongId) return;

    saveButton.disabled = true;
    showSaveStatus("Saving song...");

    try {
      // ====================================
      // VERIFY ADMIN ROLE AGAIN
      // ====================================

      const authorized = await verifyStaff();

      const user = auth.currentUser;

      if (!authorized || !user) {
        throw new Error(
          "Administrator permissions required."
        );
      }

      // ====================================
      // VALIDATE EDITED VALUES
      // ====================================

      const title = titleInput.value.trim();

      const description =
        descriptionInput.value.trim();

      const album = albumSelect.value;
      const genre = genreSelect.value;

      const releaseDate =
        releaseInput.value || "tbd";

      const lyrics = cleanLyrics(
        lyricsInput.value
      );


      const translation = translationCheckbox.checked
        ? translationInput.value
            .replace(/\r\n?/g, "\n")
            .trim()
        : "";

      if (translationCheckbox.checked && !translation) {
        throw new Error(
          "Enter a translation or uncheck the option."
        );
      }

      if (translation.length > 100000) {
        throw new Error(
          "Translation cannot exceed 100,000 characters."
        );
      }


      if (!title) {
        throw new Error("Title is required.");
      }

      if (!albumNames.includes(album)) {
        throw new Error(
          "Select a valid album from the enum."
        );
      }

      if (!genre) {
        throw new Error(
          "Genre is required."
        );
      }

      if (genre.length > 150) {
        throw new Error(
          "Genre is too long."
        );
      }

      if (!lyrics) {
        throw new Error(
          "Add lyrics before saving."
        );
      }

      if (
        invalidLegacyDate &&
        !releaseInput.value
      ) {
        throw new Error(
          "Select a valid release date. " +
          `Original value was "${invalidLegacyDate}".`
        );
      }

      const id = selectedSongId;

      const songRef = doc(
        db,
        "songs",
        id
      );

      // ====================================
      // FIELDS THAT THE EDITOR MAY CHANGE
      // ====================================

      const changes = {
        title,
        description,
        album,
        genre,
        releaseDate,
        lyrics,
        translation,
        updatedAt: serverTimestamp()
      };

      // ====================================
      // ATOMIC CREATE OR UPDATE
      // ====================================

      await runTransaction(db, async transaction => {

        const snapshot = await transaction.get(
          songRef
        );

        // If another administrator changed
        // whether this record exists, reload
        // rather than overwriting blindly.

        if (
          snapshot.exists() !==
          selectedExistsInDatabase
        ) {
          throw new Error(
            "Song database status changed. " +
            "Refresh and select it again."
          );
        }

        if (snapshot.exists()) {

          // Existing database record:
          // update only editable fields.
          // This preserves submittedBy,
          // createdAt, audio, and other fields.

          transaction.update(
            songRef,
            changes
          );

        } else {

          // JSON-only song:
          // create the Firestore document
          // using the same song ID.

          transaction.set(songRef, {
            ...changes,

            pageId: id,

            submittedBy: {
              uid: user.uid,
              username: getUsername(user)
            },

            createdAt: serverTimestamp()
          });

        }
      });

      // ====================================
      // SUCCESS
      // ====================================

      const wasImported =
        !selectedExistsInDatabase;

      selectedExistsInDatabase = true;
      invalidLegacyDate = null;

      if (wasImported) {
        submittedByInput.value =
          getUsername(user);
      }

      source.textContent =
        "Source: Firestore, with JSON fallback where available.";

      originalDate.textContent =
        "Blank saves as tbd.";

      lyricsInput.value = lyrics;

      showSaveStatus(
        wasImported
          ? `Song imported into Firestore as songs/${id}!`
          : `Song "${title}" updated successfully!`
      );

      // Refresh filters so an imported song
      // disappears from "Not in Database".
      try {
        await loadCatalog();
      } catch (refreshError) {
        console.warn(
          "Song saved but list refresh failed:",
          refreshError
        );

        searchStatus.textContent =
          "Song saved. Refresh the list to see its new status.";
      }

    } catch (error) {
      console.error(
        "Failed to save edited song:",
        error
      );

      showSaveStatus(
        `Could not save: ${error.message}`,
        true
      );

    } finally {
      saveButton.disabled = false;
    }
  });

  // ========================================
  // INITIAL CATALOG LOAD
  // ========================================

  try {
    await loadCatalog();
    setFilter("all");

  } catch (error) {
    console.error(
      "Song catalog failed:",
      error
    );

    searchStatus.textContent =
      `Unable to load songs: ${error.message}`;
  }
});
