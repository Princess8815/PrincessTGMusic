
import { db } from "./firebase.js";

import {
  collection,
  doc,
  getDocsFromServer,
  runTransaction
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

import { verifyStaff } from "./staff-auth.js";

// ==========================================
// DELETE SONG MANAGER
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {

  const $ = id => document.getElementById(id);

  const search = $("delete-song-search");
  const select = $("delete-song-select");
  const count = $("delete-song-count");

  const refreshButton = $("delete-song-refresh");

  const details = $("delete-song-details");
  const titleDisplay = $("delete-song-title");
  const idDisplay = $("delete-song-id");

  const confirmation = $("delete-song-confirm");
  const deleteButton = $("delete-song-button");
  const status = $("delete-song-status");

  if (!search || !select || !deleteButton) return;

  let songs = [];
  let deleting = false;

  // ========================================
  // HELPERS
  // ========================================

  function normalize(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function showStatus(message, error = false) {
    status.textContent = message;

    status.style.color =
      error ? "#fca5a5" : "#86efac";
  }

  function selectedSong() {
    return songs.find(
      song => song.id === select.value
    ) || null;
  }

  // ========================================
  // UPDATE SELECTED SONG
  // ========================================

  function updateSelection() {
    const song = selectedSong();

    details.hidden = !song;

    if (!song) {
      confirmation.value = "";
      deleteButton.disabled = true;
      return;
    }

    titleDisplay.textContent = song.title;
    idDisplay.textContent = song.id;

    deleteButton.disabled =
      deleting ||
      confirmation.value !== "DELETE";
  }

  // ========================================
  // SEARCHABLE SONG DROPDOWN
  // ========================================

  function renderSongOptions() {
    const query = normalize(search.value);

    const previousSelection = select.value;

    const filtered = songs.filter(song => {
      return normalize(song.title).includes(query) ||
        normalize(song.id).includes(query);
    });

    select.replaceChildren(
      new Option(
        `Select a song (${filtered.length} matches)`,
        ""
      )
    );

    for (const song of filtered) {
      select.add(
        new Option(
          `${song.title} (${song.id})`,
          song.id
        )
      );
    }

    // Preserve selection if it still matches.
    if (
      filtered.some(
        song => song.id === previousSelection
      )
    ) {
      select.value = previousSelection;
    }

    count.textContent =
      `${filtered.length} matching songs | ` +
      `${songs.length} songs in Firestore`;

    select.disabled = deleting || !filtered.length;

    updateSelection();
  }

  // ========================================
  // LOAD SONGS FROM FIRESTORE ONLY
  // ========================================

  async function loadDatabaseSongs() {
    count.textContent =
      "Loading Firestore songs...";

    select.disabled = true;
    deleteButton.disabled = true;

    const snapshot = await getDocsFromServer(
      collection(db, "songs")
    );

    songs = snapshot.docs.map(snapshot => {
      const data = snapshot.data();

      return {
        id: snapshot.id,
        title: data.title || snapshot.id
      };
    });

    songs.sort((a, b) =>
      a.title.localeCompare(
        b.title,
        undefined,
        { sensitivity: "base" }
      )
    );

    renderSongOptions();
  }

  // ========================================
  // SEARCH EVENTS
  // ========================================

  search.addEventListener("input", () => {
    renderSongOptions();
  });

  select.addEventListener("change", () => {
    confirmation.value = "";
    showStatus("");
    updateSelection();
  });

  confirmation.addEventListener(
    "input",
    updateSelection
  );

  // ========================================
  // REFRESH DATABASE LIST
  // ========================================

  refreshButton.addEventListener(
    "click",
    async () => {
      refreshButton.disabled = true;

      try {
        await loadDatabaseSongs();

        showStatus(
          "Database song list refreshed."
        );

      } catch (error) {
        showStatus(
          `Refresh failed: ${error.message}`,
          true
        );

      } finally {
        refreshButton.disabled = false;
      }
    }
  );

  // ========================================
  // PERMANENT SONG DELETION
  // ========================================

  deleteButton.addEventListener(
    "click",
    async () => {

      const song = selectedSong();

      if (!song || deleting) return;

      if (confirmation.value !== "DELETE") {
        showStatus(
          "Type DELETE exactly to confirm.",
          true
        );
        return;
      }

      const approved = window.confirm(
        "PERMANENT SONG DELETION\n\n" +
        `Song: ${song.title}\n` +
        `Firestore ID: ${song.id}\n\n` +
        "This removes the Firestore document.\n" +
        "The action cannot be undone.\n\n" +
        "Do you want to delete this song?"
      );

      if (!approved) return;

      deleting = true;
      deleteButton.disabled = true;
      select.disabled = true;
      refreshButton.disabled = true;

      showStatus("Deleting song...");

      try {
        // Recheck permissions before deletion.
        const authorized = await verifyStaff();

        if (!authorized) {
          throw new Error(
            "Administrator permissions required."
          );
        }

        const songRef = doc(
          db,
          "songs",
          song.id
        );

        // ==================================
        // ATOMIC DELETE
        // ==================================
        // Confirm the document still exists
        // and has not been renamed.
        // ==================================

        await runTransaction(
          db,
          async transaction => {

            const snapshot =
              await transaction.get(songRef);

            if (!snapshot.exists()) {
              throw new Error(
                "This song was already deleted."
              );
            }

            if (
              (snapshot.data().title || song.id)
                !== song.title
            ) {
              throw new Error(
                "Song details changed. " +
                "Refresh the list and select it again."
              );
            }

            transaction.delete(songRef);
          }
        );

        // ==================================
        // REMOVE FROM LOCAL DROPDOWN
        // ==================================

        songs = songs.filter(
          item => item.id !== song.id
        );

        select.value = "";
        confirmation.value = "";

        renderSongOptions();

        showStatus(
          `"${song.title}" was deleted ` +
          "from Firestore successfully."
        );

      } catch (error) {
        console.error(
          "Song deletion failed:",
          error
        );

        showStatus(
          `Could not delete song: ${error.message}`,
          true
        );

      } finally {
        deleting = false;
        refreshButton.disabled = false;
        renderSongOptions();
      }
    }
  );

  // ========================================
  // VERIFY STAFF AND INITIALIZE
  // ========================================

  try {
    const authorized = await verifyStaff();

    if (!authorized) {
      showStatus(
        "Administrator permissions required.",
        true
      );

      return;
    }

    await loadDatabaseSongs();

  } catch (error) {
    console.error(
      "Unable to load database songs:",
      error
    );

    showStatus(
      `Unable to load songs: ${error.message}`,
      true
    );
  }

});
