import {addToPlaylistControl} from "./music-playlists.js";

document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  // ==========================================
  // FILE LOCATIONS
  // ==========================================

  const INDEX_URL = "../audioPlayer/audio/index.json";
  const DETAILS_URL = "../audioPlayer/audio/song-details.json";
  const SONG_PAGE_FOLDER = "../audioPlayer/pages/";

  const UNCATEGORISED = "__uncategorised__";

  // ==========================================
  // PAGE ELEMENTS
  // ==========================================

  const songContainer = document.getElementById("released-songs");
  const status = document.getElementById("releases-status");
  const searchInput = document.getElementById("release-search");
  const genreSelect = document.getElementById("release-genre");
  const albumSelect = document.getElementById("release-album");
  const sortSelect = document.getElementById("release-sort");
  const resetButton = document.getElementById("release-reset");

  if (![songContainer, status, searchInput, genreSelect,
        albumSelect, sortSelect, resetButton].every(Boolean)) {
    console.error("Releases page is missing required elements.");
    return;
  }

  // ==========================================
  // NORMALIZE TITLES AND FILE NAMES
  // ==========================================

  function slugify(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function audioKey(path) {
    if (typeof path !== "string") return "";

    let fileName = path
      .split(/[\\/]/)
      .pop()
      .split(/[?#]/)[0];

    try {
      fileName = decodeURIComponent(fileName);
    } catch {
      // Leave the file name unchanged.
    }

    return slugify(fileName.replace(/\.[^.]+$/, ""));
  }

  // ==========================================
  // EXTRACT GENRES AND ALBUMS
  // ==========================================

  function valuesFrom(song, fields) {
    const values = [];

    for (const field of fields) {
      const fieldValue = song[field];

      const items = Array.isArray(fieldValue)
        ? fieldValue
        : [fieldValue];

      for (const item of items) {
        if (typeof item !== "string") continue;

        // Supports comma-separated values,
        // semicolons, pipes, and arrays.
        for (const part of item.split(/[,;|]/)) {
          const value = part.trim();

          if (!value ||
              /^(n\/a|none|unknown|tbd|uncategorised|uncategorized)$/i.test(value)) {
            continue;
          }

          if (!values.some(existing =>
            existing.toLowerCase() === value.toLowerCase()
          )) {
            values.push(value);
          }
        }
      }
    }

    return values;
  }

  function getGenres(song) {
    return valuesFrom(song, [
      "genres",
      "genre",
      "primaryGenre",
      "secondaryGenre",
      "thirdGenre",
      "genre1",
      "genre2",
      "genre3"
    ]);
  }

  function getAlbums(song) {
    return valuesFrom(song, ["albums", "album"]);
  }

  // ==========================================
  // RELEASE DATE
  // ==========================================

  function getDate(value) {
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())
    ) {
      return null;
    }

    const time = Date.parse(
      `${value.trim()}T00:00:00Z`
    );

    return Number.isFinite(time) ? time : null;
  }

  // ==========================================
  // LOAD JSON
  // ==========================================

  async function loadJSON(url) {
    const response = await fetch(url, {
      cache: "no-cache"
    });

    if (!response.ok) {
      throw new Error(
        `Failed to load ${url}: ${response.status}`
      );
    }

    return response.json();
  }

  // ==========================================
  // ALPHABETICAL COMPARISON
  // ==========================================

  const alphabetical = (a, b) =>
    a.localeCompare(b, undefined, {
      sensitivity: "base",
      numeric: true
    });

  // ==========================================
  // POPULATE FILTER DROPDOWNS
  // ==========================================

  function fillFilter(select, songs, property, allLabel) {
    select.replaceChildren(new Option(allLabel, ""));

    const unique = new Map();

    for (const song of songs) {
      for (const label of song[property]) {
        const key = label.toLocaleLowerCase();

        if (!unique.has(key)) {
          unique.set(key, label);
        }
      }
    }

    const labels = [...unique.values()]
      .sort(alphabetical);

    for (const label of labels) {
      select.add(
        new Option(label, label.toLocaleLowerCase())
      );
    }

    // Include songs without categorization.
    select.add(
      new Option("Uncategorised", UNCATEGORISED)
    );
  }

  // ==========================================
  // MATCH SELECTED FILTERS
  // ==========================================

  function matchesFilter(values, selected) {
    if (!selected) return true;

    if (selected === UNCATEGORISED) {
      return values.length === 0;
    }

    return values.some(value =>
      value.toLocaleLowerCase() === selected
    );
  }

  // ==========================================
  // SORT SONGS
  // ==========================================

  function sortSongs(songs, mode) {
    songs.sort((a, b) => {
      switch (mode) {

        case "title-desc":
          return alphabetical(b.title, a.title);

        case "album-asc":
          return alphabetical(
            a.albums[0] || "ZZZZ",
            b.albums[0] || "ZZZZ"
          ) || alphabetical(a.title, b.title);

        case "date-desc":
        case "date-asc": {
          const aDate = a.date;
          const bDate = b.date;

          // Unknown dates always go last.
          if (aDate === null && bDate !== null) return 1;
          if (bDate === null && aDate !== null) return -1;

          if (
            aDate !== null &&
            bDate !== null &&
            aDate !== bDate
          ) {
            return mode === "date-desc"
              ? bDate - aDate
              : aDate - bDate;
          }

          return alphabetical(a.title, b.title);
        }

        default:
          return alphabetical(a.title, b.title);
      }
    });

    return songs;
  }

  // ==========================================
  // CREATE SONG BUTTON
  // ==========================================

  function buildButton(song) {
    const link = document.createElement("a");

    link.className = "released-song-button";

    link.href =
      SONG_PAGE_FOLDER +
      encodeURIComponent(song.pageId) +
      ".html";

    const title = document.createElement("span");
    title.className = "released-song-title";
    title.textContent = song.title;

    const detail = document.createElement("span");
    detail.className = "released-song-meta";

    detail.textContent =
      `${song.albums.join(", ") || "Uncategorised album"} · ` +
      `${song.genres.join(", ") || "Uncategorised genre"}`;

    link.append(title, detail);
    const wrapper=document.createElement("div");
    wrapper.style.cssText="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0";
    wrapper.append(link,addToPlaylistControl(()=>["song:"+song.pageId]));
    return wrapper;
  }

  // ==========================================
  // STORE RELEASED SONGS
  // ==========================================

  let releasedSongs = [];

  // ==========================================
  // SEARCH, FILTER, SORT AND RENDER
  // ==========================================

  function render() {
    const query = searchInput.value
      .trim()
      .toLocaleLowerCase();

    const chosenGenre = genreSelect.value;
    const chosenAlbum = albumSelect.value;

    const filtered = releasedSongs.filter(song => {
      const searchable = [
        song.title,
        ...song.genres,
        ...song.albums
      ].join(" ").toLocaleLowerCase();

      return (
        searchable.includes(query) &&
        matchesFilter(song.genres, chosenGenre) &&
        matchesFilter(song.albums, chosenAlbum)
      );
    });

    sortSongs(filtered, sortSelect.value);

    const fragment = document.createDocumentFragment();

    for (const song of filtered) {
      fragment.appendChild(buildButton(song));
    }

    songContainer.replaceChildren(fragment);

    if (filtered.length) {
      status.textContent =
        `Showing ${filtered.length} of ${releasedSongs.length} released songs`;
    } else if (releasedSongs.length) {
      status.textContent =
        "No songs match your search or filters.";
    } else {
      status.textContent =
        "No released songs found.";
    }
  }

  // ==========================================
  // CONTROL EVENTS
  // ==========================================

  searchInput.addEventListener("input", render);

  genreSelect.addEventListener("change", render);

  albumSelect.addEventListener("change", render);

  sortSelect.addEventListener("change", render);

  // ==========================================
  // RESET ALL FILTERS
  // ==========================================

  resetButton.addEventListener("click", () => {
    searchInput.value = "";
    genreSelect.value = "";
    albumSelect.value = "";
    sortSelect.value = "title-asc";

    render();
  });

  // ==========================================
  // LOAD AND COMPARE SONGS
  // ==========================================

  try {
    status.textContent = "Loading released songs...";

    
    // ==========================================
    // LOAD SONGS FROM JSON AND FIRESTORE
    // ==========================================

    const { loadAllSongs } = await import(
      "./song-data.js"
    );

    const [audioIndex, songDetails] = await Promise.all([
      loadJSON(INDEX_URL),
      loadAllSongs(DETAILS_URL)
    ]);


    if (
      !Array.isArray(audioIndex) ||
      !Array.isArray(songDetails)
    ) {
      throw new Error(
        "Both JSON files must contain arrays."
      );
    }

    // ========================================
    // AUDIO FILES STILL IN INDEX.JSON
    // ========================================

    const indexedFiles = new Set(
      audioIndex.map(item => {
        const path =
          typeof item === "string"
            ? item
            : item?.file ||
              item?.path ||
              item?.src ||
              item?.title ||
              "";

        return audioKey(path);
      }).filter(Boolean)
    );

    // ========================================
    // FIND RELEASED SONGS
    // ========================================

    const seenPages = new Set();

    releasedSongs = [];

    for (const song of songDetails) {
      if (
        !song ||
        typeof song.title !== "string" ||
        !song.title.trim()
      ) {
        continue;
      }

      const audioFile = audioKey(
        song.file || song.title
      );

      // Ignore songs still in the audio index.
      if (indexedFiles.has(audioFile)) {
        continue;
      }

      // Prefer the page ID from song-details.json.
      const pageId = slugify(
        song.pageId || song.title
      );

      if (!pageId || seenPages.has(pageId)) {
        continue;
      }

      seenPages.add(pageId);

      releasedSongs.push({
        title: song.title.trim(),
        pageId,
        genres: getGenres(song),
        albums: getAlbums(song),
        date: getDate(song.releaseDate)
      });
    }

    // ========================================
    // BUILD GENRE DROPDOWN
    // ========================================

    fillFilter(
      genreSelect,
      releasedSongs,
      "genres",
      "All Genres"
    );

    // ========================================
    // BUILD ALBUM DROPDOWN
    // ========================================

    fillFilter(
      albumSelect,
      releasedSongs,
      "albums",
      "All Albums"
    );

    // ========================================
    // DISPLAY RESULTS
    // ========================================

    render();

  } catch (error) {
    console.error("Could not load releases:", error);

    status.textContent =
      "Unable to load releases. Please try again later.";
  }
});
