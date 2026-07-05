const fs = require("fs");
const path = require("path");

const siteUrl = "https://princess8815.github.io/PrincessTGMusic";
const logoUrl = `${siteUrl}/images/logo%20avatar.png`;
const audioPlayerDir = path.join(__dirname, "audioPlayer");
const detailsFile = path.join(audioPlayerDir, "audio", "song-details.json");
const pagesDir = path.join(audioPlayerDir, "pages");
const templateFile = path.join(pagesDir, "page-display.html");

function slugify(title) {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "song";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSongPage(song) {
  const title = song.title;
  const description = song.description || `Listen to ${title} by PrincessTG.`;
  const url = `${siteUrl}/audioPlayer/pages/${slugify(title)}.html`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} by PrincessTG</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:title" content="${escapeHtml(title)} by PrincessTG" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${logoUrl}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:type" content="music.song" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)} by PrincessTG" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${logoUrl}" />
  <link rel="icon" type="image/png" href="../../images/logo avatar.png" />
  <link rel="stylesheet" href="../styles/main.css" />
</head>
<body data-song-title="${escapeHtml(title)}">
  <main class="app">
    <button id="back" type="button"><a href="../index.html">Back to Song List</a></button>
    <header class="app__header">
      <h1 id="songTitle">${escapeHtml(title)}</h1>
      <p class="status">Song details page</p>
    </header>

    <section class="now-playing">
      <audio id="songPlayer" controls style="width:100%; margin-top:10px;"></audio>
      <button id="playSong">Play</button>
      <button id="stopSong">Stop</button>
    </section>

    <section class="now-playing">
      <h2>Description</h2>
      <p id="songDescription">Song description goes here.</p>
    </section>

    <section class="now-playing">
      <h2>Album</h2>
      <p id="songAlbum">Album name goes here.</p>
    </section>

    <section class="now-playing">
      <h2>Release Date</h2>
      <p id="songDate">YYYY-MM-DD</p>
    </section>

    <section class="now-playing">
      <details class="lyrics-dropdown">
        <summary>Lyrics</summary>
        <pre id="songLyrics">Lyrics go here.</pre>
      </details>
    </section>
  </main>

  <script src="../script/songlist.js"></script>
</body>
</html>
`;
}

const songs = JSON.parse(fs.readFileSync(detailsFile, "utf8"));
const seen = new Set();

for (const song of songs) {
  if (!song.title) continue;
  const slug = slugify(song.title);
  if (seen.has(slug)) continue;
  seen.add(slug);
  fs.writeFileSync(path.join(pagesDir, `${slug}.html`), renderSongPage(song), "utf8");
}

console.log(`Wrote ${seen.size} song pages to ${pagesDir}`);
