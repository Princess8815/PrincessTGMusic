
import { auth, db } from "./firebase.js";

import {
  doc,
  getDocFromServer,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

import {
  verifyStaff,
  guardStaffPage
} from "./staff-auth.js";

import {
  loadAllSongs
} from "./song-data.js";

import {
  cleanLyrics
} from "./song-lyrics.js";

// ==========================================
// DATABASE SETTINGS
// ==========================================

const SONG_COLLECTION = "songs";
const ALBUM_COLLECTION = "enums";
const ALBUM_DOCUMENT = "albums";

const SONG_JSON_URL =
  "../audioPlayer/audio/song-details.json";

// ==========================================
// SONG ID GENERATOR
// ==========================================

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "song";
}

// ==========================================
// CURRENT ACCOUNT USERNAME
// ==========================================


function getUsername() {
  return "PrincessTG";
}


// ==========================================
// INITIALIZE PAGE
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {

  const form = document.getElementById("add-song-form");

  const titleInput = document.getElementById("song-title");
  const descriptionInput = document.getElementById(
    "song-description"
  );

  const albumSelect = document.getElementById("song-album");
  const albumStatus = document.getElementById("album-status");

  const genreSelect = document.getElementById("song-genre");
  const releaseInput = document.getElementById("song-release");

  const submittedByInput = document.getElementById("song-by");
  const lyricsInput = document.getElementById("song-lyrics");
  const lyricsCollapsedInput = document.getElementById(
  "add-lyrics-collapsed"
);

const translationCollapsedInput = document.getElementById(
  "add-translation-collapsed"
);


// ==========================================
// OPTIONAL ENGLISH TRANSLATION
// ==========================================

const translationCheckbox = document.getElementById(
  "add-has-translation"
);

const translationContainer = document.getElementById(
  "add-translation-container"
);

const translationInput = document.getElementById(
  "song-translation"
);

function syncAddTranslation() {
  const enabled = translationCheckbox.checked;

  translationContainer.hidden = !enabled;
  translationInput.disabled = !enabled;
  translationInput.required = enabled;
}

translationCheckbox.addEventListener(
  "change",
  syncAddTranslation
);

syncAddTranslation();

form.addEventListener("reset", () => {
  setTimeout(syncAddTranslation, 0);
});

  const previewButton = document.getElementById(
    "preview-lyrics"
  );

  const previewContainer = document.getElementById(
    "preview-container"
  );

  const lyricsPreview = document.getElementById(
    "lyrics-preview"
  );

  const saveButton = document.getElementById("save-song");
  const status = document.getElementById("add-song-status");

  // ========================================
  // VERIFY ACCESS TO ADMIN PAGE
  // ========================================

  const allowed = await guardStaffPage({
    contentId: "admin-content",
    statusId: "admin-status",
    redirectURL: "../index.html"
  });

  if (!allowed) return;

  let allowedAlbums = [];

  function showStatus(message, error = false) {
    status.textContent = message;
    status.style.color = error
      ? "#fca5a5"
      : "#86efac";
  }

  // ========================================
  // SHOW ACCOUNT USERNAME
  // ========================================

  submittedByInput.value = getUsername(
    auth.currentUser
  );

  // ========================================
  // POPULATE GENRES
  // ========================================

  if (
    typeof window.populatePrincessTGGenres ===
    "function"
  ) {
    window.populatePrincessTGGenres();
  }

  if (genreSelect.options.length <= 1) {
    showStatus(
      "Genre list could not be loaded.",
      true
    );
  }

  // ========================================
  // LOAD ALBUMS FROM FIRESTORE
  // ========================================

  async function loadAlbums() {
    albumSelect.disabled = true;
    saveButton.disabled = true;

    albumStatus.textContent = "Loading albums...";

    const snapshot = await getDocFromServer(
      doc(
        db,
        ALBUM_COLLECTION,
        ALBUM_DOCUMENT
      )
    );

    if (!snapshot.exists()) {
      throw new Error(
        "Missing Firestore document: enums/albums"
      );
    }

    const values = snapshot.data().values;

    if (!Array.isArray(values)) {
      throw new Error(
        "enums/albums must contain a values array."
      );
    }

    allowedAlbums = [
      ...new Set(
        values
          .filter(value =>
            typeof value === "string" &&
            value.trim()
          )
          .map(value => value.trim())
      )
    ].sort((a, b) => a.localeCompare(b));

    if (!allowedAlbums.length) {
      throw new Error(
        "No albums found in enums/albums."
      );
    }

    albumSelect.replaceChildren(
      new Option("Select album", "")
    );

    for (const album of allowedAlbums) {
      albumSelect.add(
        new Option(album, album)
      );
    }

    albumSelect.disabled = false;
    saveButton.disabled = false;

    albumStatus.textContent =
      `${allowedAlbums.length} albums loaded.`;
  }

  try {
    await loadAlbums();
  } catch (error) {
    console.error("Album loading error:", error);

    albumStatus.textContent = error.message;

    showStatus(
      "Unable to load the album dropdown.",
      true
    );
  }


// Keep the Add Song selector synchronized with album management.
window.addEventListener("princesstg:albums-updated", () => {
  const selected = albumSelect.value;
  void loadAlbums().then(() => {
    if (allowedAlbums.includes(selected)) albumSelect.value = selected;
  }).catch(error => {
    console.error("Album selector refresh failed:", error);
    albumStatus.textContent = error.message;
  });
});

// Album Add/Edit/Delete now belongs to admin-albums.js.
// Keep song loading and saving independent of album management.

  // ========================================
  // PREVIEW FORMATTED LYRICS
  // ========================================

  previewButton.addEventListener("click", () => {

    const formatted = cleanLyrics(
      lyricsInput.value
    );

    if (!formatted) {
      showStatus(
        "Enter lyrics before previewing.",
        true
      );
      return;
    }

    lyricsPreview.textContent = formatted;
    previewContainer.hidden = false;

    showStatus("Lyrics preview generated.");
  });

  lyricsInput.addEventListener("input", () => {
    previewContainer.hidden = true;
  });

  form.addEventListener("reset", () => {
    previewContainer.hidden = true;
    status.textContent = "";

    // Reset does not remove the login identity.
    submittedByInput.value = getUsername(
      auth.currentUser
    );
  });

  // ========================================
  // SAVE SONG TO DATABASE
  // ========================================

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    saveButton.disabled = true;

    try {
      // ====================================
      // VERIFY AUTHORIZATION AGAIN
      // ====================================

      const authorized = await verifyStaff();

      if (!authorized) {
        throw new Error(
          "Administrator permissions required."
        );
      }

      const user = auth.currentUser;

      if (!user) {
        throw new Error(
          "You must be signed in."
        );
      }

      // ====================================
      // COLLECT FORM VALUES
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
    "Enter an English translation or uncheck the option."
  );
}

if (translation.length > 100000) {
  throw new Error("Translation is too long.");
}


      const username = getUsername(user);

      if (!title) {
        throw new Error("Song title is required.");
      }

      if (!lyrics) {
        throw new Error("Song lyrics are required.");
      }

      if (!allowedAlbums.includes(album)) {
        throw new Error(
          "Please select an album from the database."
        );
      }

      const genres =
        window.PrincessTGGenres || [];

      if (!genres.includes(genre)) {
        throw new Error(
          "Please select a valid genre."
        );
      }

      // ====================================
      // FIND AN AVAILABLE SONG PAGE ID
      // ====================================
      // Check songs in BOTH JSON and Firestore
      // so new records do not reuse an ID.
      // ====================================

      showStatus("Checking existing songs...");

      const existingSongs = await loadAllSongs(
        SONG_JSON_URL
      );

      const usedIds = new Set(
        existingSongs.map(song =>
          slugify(song.pageId || song.title)
        )
      );

      const baseId = slugify(title);

      let pageId = baseId;
      let suffix = 2;

      while (usedIds.has(pageId)) {
        pageId = `${baseId}-${suffix}`;
        suffix += 1;
      }

      // ====================================
      // CREATE NEW SONG OBJECT
      // ====================================

      const newSong = {
        title,
        pageId,
        description,
        album,
        genre,
        releaseDate,
        lyrics,
        lyricsCollapsed: lyricsCollapsedInput.checked,
translationCollapsed: translationCollapsedInput.checked,
        newsletterQueued: document.getElementById("add-newsletter-queue").checked,
        ...(translation ? { translation } : {}),

        submittedBy: {
          uid: user.uid,
          username
        },

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const songRef = doc(
        db,
        SONG_COLLECTION,
        pageId
      );

      // ====================================
      // WRITE TO FIRESTORE
      // ====================================
      // Transaction prevents overwriting an
      // existing Firestore document.
      // ====================================

      showStatus("Saving song to Firestore...");

      await runTransaction(db, async transaction => {

        const snapshot = await transaction.get(songRef);

        if (snapshot.exists()) {
          throw new Error(
            "This song ID already exists. " +
            "Please try again."
          );
        }

        transaction.set(songRef, newSong);
      });

      // ====================================
      // SUCCESS
      // ====================================

      console.log(
        "Song saved to Firestore:",
        pageId
      );

      form.reset();

      submittedByInput.value = getUsername(
        auth.currentUser
      );

      previewContainer.hidden = true;

      showStatus(
        `Song saved successfully! ` +
        `Firestore document: songs/${pageId}`
      );

    } catch (error) {
      console.error(
        "Failed to save song:",
        error
      );

      showStatus(
        `Could not save song: ${error.message}`,
        true
      );

    } finally {
      saveButton.disabled = albumSelect.disabled;
    }
  });
});
