#!/usr/bin/env node
"use strict";

/*
 * Save this file in the root of your PrincessTGMusic repository.
 * Requires Node.js 18 or newer; no npm packages are needed.
 *
 * Run the prompts:
 *   node create-album.cjs
 *
 * Or supply the album details:
 *   node create-album.cjs --name "Music From The Year" --date "2026-12-01" --description "Twelve songs, one journey."
 *
 * Creates albums/music-from-the-year.html. Add --force to replace that page.
 * Songs stay in JSON order. Their album field must match the album name,
 * ignoring capitalization and extra whitespace. Song titles are preserved.
 * Also writes albums/index.html, which lists every album in song-details.json.
 * This script does not change song-details.json or your home page.
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const readline = require("node:readline/promises");

// Optional: fill these in instead of using prompts or command-line options.
const ALBUM = {
  name: "",
  releaseDate: "",
  description: "",
};

const HELP = `Create an album page with an audio player.

Usage:
  node create-album.cjs
  node create-album.cjs --name "Album name" --date "2026-12-01" --description "About the album"
  node create-album.cjs --index

Options:
  --name           Album name to match against each song's album field
  --date           Release date or text such as "TBD"
  --description    Album description (optional; quoted text can contain newlines)
  --root           Repository root (defaults to this script's directory)
  --force          Replace an existing generated page
  --index          Write only albums/index.html without creating an album
  --help           Show this help

Input:  ./audioPlayer/audio/song-details.json
Output: ./albums/<album-name>.html and ./albums/index.html

The JSON should be an array of song objects, or an object with a songs array.
Audio files live in ./audioPlayer/audio/. A JSON file value such as
../audio/Febuary.mp3 becomes ../audioPlayer/audio/Febuary.mp3 on the album page.
Bare filenames and audio/... or audioPlayer/audio/... paths also work.
File names with spaces are encoded automatically.

After uploading the page and audio to your website, open the album's URL.
For local preview, serve the repository with a local HTTP server.
`;

function parseOptions(args) {
  const options = { ...ALBUM, root: __dirname, force: false };
  const names = { "--name": "name", "--date": "releaseDate", "--description": "description", "--root": "root" };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (arg === "--force") { options.force = true; continue; }
    if (arg === "--index") { options.indexOnly = true; continue; }
    if (!names[arg]) throw new Error("Unknown option: " + arg + ". Use --help for usage.");
    const value = args[++i];
    if (value === undefined || value.startsWith("--")) throw new Error(arg + " needs a value.");
    options[names[arg]] = value;
  }
  return options;
}

async function getAlbumDetails(options) {
  if (process.stdin.isTTY && (!options.name.trim() || !options.releaseDate.trim())) {
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (!options.name.trim()) options.name = await prompt.question("Album name: ");
      if (!options.releaseDate.trim()) options.releaseDate = await prompt.question("Release date [TBD]: ");
      if (!options.description.trim()) options.description = await prompt.question("Album description [optional]: ");
    } finally { prompt.close(); }
  }
  options.name = options.name.trim();
  options.releaseDate = options.releaseDate.trim() || "TBD";
  options.description = options.description.trim();
  if (!options.name) throw new Error("Set ALBUM.name or supply --name \"Your album name\".");
  return options;
}

function matchName(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function slugify(name) {
  let slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
  if (!slug) slug = "album";
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(slug)) slug += "-album";
  if (slug === "index") slug = "index-album";
  return slug;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function safeJson(value) {
  // Prevent lyrics/descriptions containing </script> from breaking the page.
  return JSON.stringify(value).replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function audioUrl(file) {
  const value = file.trim().replace(/\\/g, "/");
  const base = "https://album-generator.invalid/audioPlayer/audio/";
  const url = new URL(value, base);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Unsupported audio URL: " + file + ". Use a relative path or an HTTP(S) URL.");
  }
  if (/^(?:https?:)?\/\//i.test(value)) return value.startsWith("//") ? "//" + url.host + url.pathname + url.search + url.hash : url.href;
  if (value.startsWith("/")) return url.pathname + url.search + url.hash;
  // Local files belong to the repository's audioPlayer/audio folder. Strip
  // legacy ../audio/ prefixes rather than resolving them against ./albums.
  const localFile = value.replace(/^(?:\.\.?\/)+/, "").replace(/^(?:audioPlayer\/)?audio\//i, "");
  const audio = new URL(localFile, base);
  if (!audio.pathname.startsWith("/audioPlayer/audio/")) {
    throw new Error("Audio file must be inside audioPlayer/audio: " + file);
  }
  return path.posix.relative("albums", audio.pathname.slice(1)) + audio.search + audio.hash;
}

const PAGE_CSS = String.raw`
:root {
  --bg: #11131a;
  --card: #1d2230;
  --text: #f3f5ff;
  --muted: #b9bfd4;
  --accent: #9f7bff;
  --accent-hover: #bda7ff;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: Arial, Helvetica, sans-serif;
  background: linear-gradient(160deg, #0d1018, #171d2a 45%, #11131a);
  color: var(--text);
  line-height: 1.5;
}
.hero, main, footer { width: min(960px, 92vw); margin: 0 auto; }
.hero {
  background: url("../images/logo-removebg-preview.png") center / contain no-repeat;
  min-height: 240px;
  display: flex;
  align-items: stretch;
}
.hero a { width: 100%; min-height: 240px; border-radius: 16px; }
section, footer {
  background: rgba(29, 34, 48, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 1.25rem;
  margin-bottom: 1rem;
}
h1, h2 { margin: 0 0 0.5rem; overflow-wrap: anywhere; }
h1 { font-size: clamp(1.8rem, 6vw, 2.8rem); }
p { margin: 0.5rem 0; }
.eyebrow, .release, .description, .muted, .status { color: var(--muted); }
.eyebrow { margin-top: 0; color: var(--accent-hover); }
.description, #song-description { white-space: pre-wrap; overflow-wrap: anywhere; }
.back-link, footer a { color: var(--accent); }
.back-link { display: inline-block; margin-bottom: 1rem; text-decoration: none; }
a:hover { color: var(--accent-hover); }
button, input { font: inherit; }
button {
  background: #101521;
  color: var(--text);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  padding: 0.65rem 1rem;
  min-height: 44px;
  cursor: pointer;
}
button:hover:not(:disabled) { border-color: var(--accent-hover); }
button:disabled, input:disabled { opacity: 0.5; cursor: default; }
button:focus-visible, a:focus-visible, input:focus-visible, summary:focus-visible {
  outline: 3px solid var(--accent-hover);
  outline-offset: 3px;
}
#play { background: var(--accent); border-color: var(--accent); color: #101521; font-weight: bold; }
#play:hover { background: var(--accent-hover); }
.controls, .volume-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.65rem; }
.controls { margin: 1rem 0; }
.progress { display: flex; gap: 0.75rem; align-items: center; margin: 1rem 0; }
.progress span { min-width: 3.25rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.progress span:last-child { text-align: right; }
input[type="range"] { accent-color: var(--accent); min-width: 0; cursor: pointer; }
#seek { flex: 1; width: 100%; }
#volume { width: min(150px, 32vw); }
.repeat { margin-left: auto; cursor: pointer; }
.repeat input { accent-color: var(--accent); width: 1.1rem; height: 1.1rem; vertical-align: middle; }
.status { min-height: 1.5em; }
audio { width: 100%; display: block; margin: 1rem 0; }
audio:not([controls]) { display: none; }
.track-list { list-style: none; padding: 0; margin: 1rem 0 0; display: grid; gap: 0.55rem; }
.track-list button {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.65rem;
  text-align: left;
  width: 100%;
}
.track-list .active button { border-color: var(--accent); background: rgba(159, 123, 255, 0.12); }
.track-number, .track-state { color: var(--muted); }
.track-state { font-size: 0.85rem; }
.track-title { overflow-wrap: anywhere; }
summary { cursor: pointer; color: var(--accent-hover); padding: 0.5rem 0; }
.lyrics {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.1rem;
  line-height: 1.8;
  color: var(--text);
  background: #101521;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 1.25rem;
  margin: 0.5rem 0 0;
}
footer { margin-bottom: 2rem; color: var(--muted); }
[hidden] { display: none !important; }
@media (max-width: 480px) {
  .hero, .hero a { min-height: 180px; }
  section, footer { padding: 1rem; }
  .controls button { flex: 1 1 calc(50% - 0.65rem); }
  .repeat { margin-left: 0; width: 100%; }
  .track-list button { gap: 0.35rem; padding: 0.65rem; }
}
`;

const PAGE_SCRIPT = String.raw`
(() => {
  "use strict";
  const { tracks } = JSON.parse(document.getElementById("album-data").textContent);
  const get = (id) => document.getElementById(id);
  const audio = get("audio");
  const play = get("play");
  const seek = get("seek");
  const volume = get("volume");
  const rows = Array.from(get("track-list").children);
  let current = 0;
  let playRequest = 0;
  let stopped = false;

  const status = (message) => { get("status").textContent = message; };
  function time(seconds) {
    if (!Number.isFinite(seconds)) return "--:--";
    seconds = Math.max(0, Math.floor(seconds));
    return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  }
  function updateProgress() {
    const ready = Number.isFinite(audio.duration) && audio.duration > 0;
    seek.disabled = !ready;
    seek.max = ready ? audio.duration : 1;
    seek.value = ready ? audio.currentTime : 0;
    get("elapsed").textContent = time(audio.currentTime);
    get("duration").textContent = time(audio.duration);
    seek.setAttribute("aria-valuetext", time(audio.currentTime) + " of " + time(audio.duration));
  }
  function updateButtons() {
    const playing = !audio.paused && !audio.ended;
    play.textContent = playing ? "Pause" : "Play";
    play.setAttribute("aria-pressed", String(playing));
    rows.forEach((row, index) => {
      const selected = index === current;
      row.classList.toggle("active", selected);
      const button = row.querySelector("button");
      if (selected) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
      row.querySelector(".track-state").textContent = selected ? (playing ? "Playing" : "Selected") : "Play";
    });
  }
  function updateVolume() {
    volume.value = audio.volume;
    const muted = audio.muted || audio.volume === 0;
    get("mute").textContent = muted ? "Unmute" : "Mute";
    get("mute").setAttribute("aria-pressed", String(muted));
    get("volume-value").textContent = Math.round((muted ? 0 : audio.volume) * 100) + "%";
  }
  async function startPlayback() {
    const request = ++playRequest;
    try { await audio.play(); }
    catch (error) {
      if (request !== playRequest || error.name === "AbortError") return;
      status(error.name === "NotAllowedError"
        ? "Press Play to start the music."
        : "Unable to play this track. Try another track or reload the page.");
      updateButtons();
    }
  }
  function selectTrack(index, autoplay) {
    ++playRequest;
    audio.pause();
    current = index;
    stopped = false;
    const track = tracks[current];
    audio.src = track.src;
    audio.load();
    get("now-title").textContent = track.title;
    get("track-position").textContent = "Track " + (current + 1) + " of " + tracks.length;
    get("song-description").textContent = track.description;
    get("song-description").hidden = !track.description;
    get("lyrics").textContent = track.lyrics;
    get("lyrics-panel").hidden = !track.lyrics;
    get("song-info").hidden = !track.description && !track.lyrics;
    status("Ready to play " + track.title + ".");
    updateProgress();
    updateButtons();
    if (autoplay) void startPlayback();
  }
  function skip(direction) {
    const wasPlaying = !audio.paused && !audio.ended;
    if (direction < 0 && audio.currentTime > 3) {
      audio.currentTime = 0;
      updateProgress();
      return;
    }
    selectTrack((current + direction + tracks.length) % tracks.length, wasPlaying);
  }

  play.addEventListener("click", () => {
    if (audio.paused) {
      stopped = false;
      if (audio.ended) audio.currentTime = 0;
      void startPlayback();
    } else { ++playRequest; audio.pause(); }
  });
  get("stop").addEventListener("click", () => {
    ++playRequest;
    stopped = true;
    audio.pause();
    audio.currentTime = 0;
    updateProgress();
    updateButtons();
    status("Stopped. Press Play to restart " + tracks[current].title + ".");
  });
  get("previous").addEventListener("click", () => skip(-1));
  get("next").addEventListener("click", () => skip(1));
  rows.forEach((row, index) => row.querySelector("button").addEventListener("click", () => selectTrack(index, true)));
  seek.addEventListener("input", () => {
    if (!seek.disabled) audio.currentTime = Number(seek.value);
    updateProgress();
  });
  volume.addEventListener("input", () => {
    audio.volume = Number(volume.value);
    if (audio.volume > 0) audio.muted = false;
  });
  get("mute").addEventListener("click", () => {
    if (audio.muted || audio.volume === 0) { audio.muted = false; if (audio.volume === 0) audio.volume = 1; }
    else audio.muted = true;
  });
  audio.addEventListener("volumechange", updateVolume);
  ["loadedmetadata", "durationchange", "timeupdate", "emptied"].forEach((event) => audio.addEventListener(event, updateProgress));
  audio.addEventListener("play", () => { updateButtons(); status("Playing " + tracks[current].title + "."); });
  audio.addEventListener("pause", () => {
    updateButtons();
    if (!audio.ended && !stopped) status("Paused: " + tracks[current].title + ".");
  });
  audio.addEventListener("ended", () => {
    if (current + 1 < tracks.length) selectTrack(current + 1, true);
    else if (get("repeat").checked) selectTrack(0, true);
    else { updateButtons(); status("Album finished. Choose a track to listen again."); }
  });
  audio.addEventListener("error", () => {
    updateButtons();
    status("Could not load " + tracks[current].title + ". Try another track.");
  });

  // Keep native controls as a fallback if JavaScript is disabled.
  audio.controls = false;
  get("custom-controls").hidden = false;
  get("previous").disabled = tracks.length < 2;
  get("next").disabled = tracks.length < 2;
  selectTrack(0, false);
  updateVolume();
})();
`;

function renderPage(album, tracks) {
  const first = tracks[0];
  const list = tracks.map((track, index) => `        <li><button type="button" aria-label="Play ${escapeHtml(track.title)}"><span class="track-number">${index + 1}</span><span class="track-title">${escapeHtml(track.title)}</span><span class="track-state" aria-hidden="true">Play</span></button></li>`).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(album.description || "Listen to " + album.name + " by PrincessTG.")}">
  <title>${escapeHtml(album.name)} | PrincessTG Music</title>
  <style>${PAGE_CSS}</style>
</head>
<body>
  <header class="hero"><a href="../index.html" aria-label="PrincessTG Music home"></a></header>
  <main>
    <a class="back-link" href="./index.html">\u2190 All albums</a>
    <section aria-labelledby="album-title">
      <p class="eyebrow">PrincessTG Music</p>
      <h1 id="album-title">${escapeHtml(album.name)}</h1>
      <p class="release"><strong>Release date:</strong> ${escapeHtml(album.releaseDate)}</p>
      ${album.description ? `<p class="description">${escapeHtml(album.description)}</p>` : ""}
    </section>
    <section aria-labelledby="now-title">
      <p class="muted">Now playing</p>
      <h2 id="now-title">${escapeHtml(first.title)}</h2>
      <p class="muted" id="track-position">Track 1 of ${tracks.length}</p>
      <audio id="audio" controls preload="metadata" src="${escapeHtml(first.src)}">Your browser does not support audio playback.</audio>
      <div id="custom-controls" hidden>
        <div class="controls">
          <button id="previous" type="button" aria-label="Previous track">Previous</button>
          <button id="play" type="button" aria-pressed="false">Play</button>
          <button id="stop" type="button">Stop</button>
          <button id="next" type="button" aria-label="Next track">Next</button>
        </div>
        <div class="progress">
          <span id="elapsed">0:00</span>
          <input id="seek" type="range" min="0" max="1" step="0.1" value="0" aria-label="Seek in current track" disabled>
          <span id="duration">--:--</span>
        </div>
        <div class="volume-row">
          <button id="mute" type="button" aria-pressed="false">Mute</button>
          <label for="volume">Volume</label>
          <input id="volume" type="range" min="0" max="1" step="0.05" value="1">
          <span id="volume-value">100%</span>
          <label class="repeat"><input id="repeat" type="checkbox"> Repeat album</label>
        </div>
      </div>
      <p id="status" class="status" role="status" aria-live="polite">Choose Play to start the album.</p>
      <noscript><p>The native audio controls play the first track. Enable JavaScript for the full playlist.</p></noscript>
    </section>
    <section aria-labelledby="tracks-heading">
      <h2 id="tracks-heading">Album tracks</h2>
      <p class="muted">${tracks.length} ${tracks.length === 1 ? "song" : "songs"} \u00b7 Select a song to play it.</p>
      <ol id="track-list" class="track-list">
${list}
      </ol>
    </section>
    <section id="song-info" aria-labelledby="song-heading"${!first.description && !first.lyrics ? " hidden" : ""}>
      <h2 id="song-heading">Song details</h2>
      <p id="song-description"${!first.description ? " hidden" : ""}>${escapeHtml(first.description)}</p>
      <details id="lyrics-panel"${!first.lyrics ? " hidden" : ""}>
        <summary>Lyrics</summary>
        <pre id="lyrics" class="lyrics">${escapeHtml(first.lyrics)}</pre>
      </details>
    </section>
  </main>
  <footer>PrincessTG Music \u00b7 <a href="./index.html">All albums</a> \u00b7 <a href="../index.html">Home</a></footer>
  <script id="album-data" type="application/json">${safeJson({ tracks })}</script>
  <script>${PAGE_SCRIPT}</script>
</body>
</html>
`;
}

const INDEX_PAGE = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Browse and listen to every album by PrincessTG.">
  <title>All Albums | PrincessTG Music</title>
  <style>
    :root {
      --bg: #11131a;
      --card: #1d2230;
      --text: #f3f5ff;
      --muted: #b9bfd4;
      --accent: #9f7bff;
      --accent-hover: #bda7ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      background: linear-gradient(160deg, #0d1018, #171d2a 45%, #11131a);
      color: var(--text);
      line-height: 1.5;
      min-height: 100vh;
    }
    .hero, main, footer { width: min(960px, 92vw); margin: 0 auto; }
    .hero {
      background: url("../images/logo-removebg-preview.png") center / contain no-repeat;
      min-height: 240px;
      display: flex;
    }
    .hero a { width: 100%; min-height: 240px; border-radius: 16px; }
    section, footer {
      background: rgba(29, 34, 48, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 1.25rem;
      margin-bottom: 1rem;
    }
    h1, h2 { margin: 0 0 0.5rem; overflow-wrap: anywhere; }
    h1 { font-size: clamp(1.8rem, 6vw, 2.8rem); }
    h2 { font-size: 1.35rem; }
    p { margin: 0.5rem 0; }
    .muted, .song-count, .page-status { color: var(--muted); }
    .eyebrow { color: var(--accent-hover); margin-top: 0; }
    a { color: var(--accent); }
    a:hover { color: var(--accent-hover); }
    .back-link { display: inline-block; text-decoration: none; margin-bottom: 1rem; }
    .search-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-top: 1.25rem; }
    input, button { font: inherit; }
    input[type="search"] {
      background: #101521;
      color: var(--text);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 10px;
      min-height: 44px;
      padding: 0.65rem 0.9rem;
      width: min(100%, 390px);
      flex: 1 1 200px;
    }
    input::placeholder { color: var(--muted); }
    button, .open-album {
      display: inline-block;
      background: var(--accent);
      color: #101521;
      border: 1px solid var(--accent);
      border-radius: 10px;
      min-height: 44px;
      padding: 0.65rem 1rem;
      font-weight: bold;
      cursor: pointer;
      text-decoration: none;
    }
    button:hover, .open-album:hover { background: var(--accent-hover); color: #101521; }
    button:disabled { opacity: 0.5; cursor: default; }
    a:focus-visible, input:focus-visible, button:focus-visible {
      outline: 3px solid var(--accent-hover);
      outline-offset: 3px;
    }
    .album-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 1rem; }
    .album-card {
      background: #101521;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.45rem;
    }
    .album-card:hover { border-color: var(--accent-hover); }
    .album-card h2 { margin: 0; }
    .album-card .song-count { margin: 0 0 0.65rem; }
    .album-card .open-album { margin-top: auto; }
    .page-status { margin: auto 0 0; font-size: 0.9rem; }
    footer { margin-bottom: 2rem; color: var(--muted); }
    [hidden] { display: none !important; }
    @media (max-width: 480px) {
      .hero, .hero a { min-height: 180px; }
      section, footer, .album-card { padding: 1rem; }
    }
  </style>
</head>
<body>
  <header class="hero"><a href="../index.html" aria-label="PrincessTG Music home"></a></header>
  <main>
    <a class="back-link" href="../index.html">← Back to main page</a>
    <section aria-labelledby="page-title">
      <p class="eyebrow">PrincessTG Music</p>
      <h1 id="page-title">All albums</h1>
      <p class="muted">Find an album and explore its songs.</p>
      <div class="search-row">
        <label for="search">Search albums</label>
        <input id="search" type="search" placeholder="Album name…" disabled>
        <button id="reload" type="button">Refresh</button>
      </div>
      <p id="status" class="muted" role="status" aria-live="polite">Loading albums…</p>
    </section>
    <section aria-label="Album collection">
      <div id="album-grid" class="album-grid"></div>
      <p id="empty" class="muted" hidden>No albums found.</p>
      <noscript><p>Enable JavaScript to browse the album collection.</p></noscript>
    </section>
  </main>
  <footer>PrincessTG Music · <a href="../index.html">Home</a> · <a href="../audioPlayer/index.html">All songs</a></footer>
  <script>
    (() => {
      "use strict";
      const grid = document.getElementById("album-grid");
      const search = document.getElementById("search");
      const status = document.getElementById("status");
      const empty = document.getElementById("empty");
      const reload = document.getElementById("reload");
      let cards = [];

      function matchName(value) {
        return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
      }
      function slugify(name) {
        let slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
          .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
        if (!slug) slug = "album";
        if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(slug)) slug += "-album";
        if (slug === "index") slug = "index-album";
        return slug;
      }
      function filterAlbums() {
        const query = matchName(search.value);
        let visible = 0;
        let songs = 0;
        for (const item of cards) {
          item.card.hidden = !matchName(item.name).includes(query);
          if (!item.card.hidden) { visible++; songs += item.count; }
        }
        empty.hidden = visible > 0;
        empty.textContent = query ? "No albums match your search." : "No albums yet.";
        status.textContent = visible + (visible === 1 ? " album" : " albums") +
          " · " + songs + (songs === 1 ? " song" : " songs");
      }
      function createCard(album) {
        const card = document.createElement("article");
        card.className = "album-card";
        const title = document.createElement("h2");
        title.textContent = album.name;
        const count = document.createElement("p");
        count.className = "song-count";
        count.textContent = album.count + (album.count === 1 ? " song" : " songs");
        const link = document.createElement("a");
        link.className = "open-album";
        link.href = "./" + slugify(album.name) + ".html";
        link.textContent = "Open album";
        link.setAttribute("aria-label", "Open " + album.name);
        const note = document.createElement("p");
        note.className = "page-status";
        note.textContent = "Album page not available yet.";
        note.hidden = true;
        card.append(title, count, link, note);
        grid.append(card);
        return { ...album, card, link, note };
      }
      async function checkPages(items) {
        let next = 0;
        async function worker() {
          while (next < items.length) {
            const item = items[next++];
            try {
              const response = await fetch(item.link.href, { method: "HEAD", cache: "no-store" });
              if (response.status === 404 || response.status === 410) {
                item.link.hidden = true;
                item.note.hidden = false;
              }
            } catch { /* Keep the link available when a page check fails. */ }
          }
        }
        await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker));
      }
      async function loadAlbums() {
        reload.disabled = true;
        search.disabled = true;
        status.textContent = "Loading albums…";
        grid.replaceChildren();
        cards = [];
        empty.hidden = true;
        try {
          const response = await fetch("../audioPlayer/audio/song-details.json", { cache: "no-store" });
          if (!response.ok) throw new Error("Catalog could not be loaded.");
          const data = await response.json();
          const songs = Array.isArray(data) ? data : data && data.songs;
          if (!Array.isArray(songs)) throw new Error("Invalid song catalog.");
          const albums = new Map();
          for (const song of songs) {
            if (!song || typeof song.album !== "string" || !song.album.trim()) continue;
            const key = matchName(song.album);
            if (!albums.has(key)) albums.set(key, { name: song.album.trim(), count: 0 });
            albums.get(key).count++;
          }
          cards = Array.from(albums.values())
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(createCard);
          search.disabled = false;
          filterAlbums();
          void checkPages(cards);
        } catch {
          status.textContent = "Albums could not be loaded. Try Refresh.";
          empty.hidden = false;
          empty.textContent = "The album collection is temporarily unavailable.";
        } finally { reload.disabled = false; }
      }
      search.addEventListener("input", filterAlbums);
      reload.addEventListener("click", loadAlbums);
      void loadAlbums();
    })();
  </script>
</body>
</html>
`;

async function writeAlbumIndex(root) {
  const folder = path.join(root, "albums");
  await fs.mkdir(folder, { recursive: true });
  const output = path.join(folder, "index.html");
  await fs.writeFile(output, INDEX_PAGE, "utf8");
  return output;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }
  if (options.indexOnly) {
    console.log("Created " + await writeAlbumIndex(path.resolve(options.root)));
    return;
  }
  const album = await getAlbumDetails(options);
  const root = path.resolve(options.root);
  const source = path.join(root, "audioPlayer", "audio", "song-details.json");
  let data;
  try { data = JSON.parse((await fs.readFile(source, "utf8")).replace(/^\uFEFF/, "")); }
  catch (error) {
    if (error.code === "ENOENT") throw new Error("Could not find " + source + ". Put this script in your repository root, or use --root.");
    if (error instanceof SyntaxError) throw new Error("song-details.json is not valid JSON: " + error.message);
    throw error;
  }
  const songs = Array.isArray(data) ? data : data && data.songs;
  if (!Array.isArray(songs)) throw new Error("song-details.json must be an array of songs or an object containing a songs array.");
  const matches = songs.filter((song) => song && typeof song.album === "string" && matchName(song.album) === matchName(album.name));
  if (!matches.length) throw new Error("No songs have album: \"" + album.name + "\". Check the album fields in song-details.json.");
  const tracks = matches.map((song, index) => {
    if (typeof song.file !== "string" || !song.file.trim()) throw new Error("Matched track " + (index + 1) + " is missing its file path.");
    return {
      title: typeof song.title === "string" && song.title.trim() ? song.title : "Track " + (index + 1),
      src: audioUrl(song.file),
      description: typeof song.description === "string" ? song.description : "",
      lyrics: typeof song.lyrics === "string" ? song.lyrics : "",
    };
  });
  const folder = path.join(root, "albums");
  const output = path.join(folder, slugify(album.name) + ".html");
  await fs.mkdir(folder, { recursive: true });
  try { await fs.writeFile(output, renderPage(album, tracks), { flag: options.force ? "w" : "wx" }); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error(output + " already exists. Add --force to replace it.");
    throw error;
  }
  console.log("Created " + output);
  console.log("Created " + await writeAlbumIndex(root));
  console.log("Included " + tracks.length + " matching " + (tracks.length === 1 ? "song" : "songs") + " in JSON order.");
  console.log("Run the script again with --force after adding songs or changing album details.");
}

main().catch((error) => { console.error("Error: " + error.message); process.exitCode = 1; });
