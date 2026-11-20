
const fs = require("node:fs");
const path = require("node:path");

// ==========================================
// FILE LOCATIONS
// ==========================================

const ROOT = __dirname;

const ALBUMS_DIR = path.join(ROOT, "albums");

const DETAILS_FILE = path.join(
  ROOT,
  "audioPlayer",
  "audio",
  "song-details.json"
);

const DRY_RUN = process.argv.includes("--dry-run");

// ==========================================
// NORMALIZE SONG AND ALBUM NAMES
// ==========================================

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ==========================================
// NORMALIZE AUDIO FILENAMES
// ==========================================

function audioKey(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  let file = value
    .split(/[?#]/)[0]
    .replace(/\\/g, "/");

  try {
    file = decodeURIComponent(file);
  } catch {
    // Keep the original name.
  }

  return normalize(
    path.posix.basename(file).replace(/\.[^.]+$/, "")
  );
}

// ==========================================
// REMOVE HTML TAGS AND DECODE ENTITIES
// ==========================================

function plainText(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(
      /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
      (full, code) => {
        const named = {
          amp: "&",
          lt: "<",
          gt: ">",
          quot: '"',
          apos: "'",
          nbsp: " "
        };

        if (code.startsWith("#")) {
          const hex = /^#x/i.test(code);
          const number = parseInt(
            code.slice(hex ? 2 : 1),
            hex ? 16 : 10
          );

          return Number.isInteger(number) &&
            number >= 0 &&
            number <= 0x10ffff
              ? String.fromCodePoint(number)
              : full;
        }

        return named[code.toLowerCase()] ?? full;
      }
    )
    .replace(/\s+/g, " ")
    .trim();
}

// ==========================================
// READ AND VALIDATE RELEASE DATES
// ==========================================

function dateFromText(text) {
  const match = String(text).match(
    /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/
  );

  if (!match) return null;

  const [, yearString, monthString, dayString] = match;

  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);

  const date = new Date(Date.UTC(
    year,
    month - 1,
    day
  ));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return [
    yearString,
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}

// ==========================================
// EXTRACT A SONG'S ALBUM NAMES
// ==========================================

function albumNames(song) {
  const values = [
    song.album,
    song.albums
  ].flat();

  return values
    .filter(value => typeof value === "string")
    .flatMap(value => value.split(/[,;|]/))
    .map(normalize)
    .filter(Boolean);
}

// ==========================================
// SCAN ALL ALBUM HTML PAGES
// ==========================================

function loadAlbums() {
  const files = fs.readdirSync(ALBUMS_DIR)
    .filter(filename =>
      filename.toLowerCase().endsWith(".html") &&
      filename.toLowerCase() !== "index.html"
    )
    .sort();

  const albums = [];

  for (const filename of files) {
    const filePath = path.join(ALBUMS_DIR, filename);

    const html = fs.readFileSync(
      filePath,
      "utf8"
    );

    // ======================================
    // GET ALBUM TITLE
    // ======================================

    const titleBlock = html.match(
      /<h1\b[^>]*\bid=["']album-title["'][^>]*>([\s\S]*?)<\/h1>/i
    )?.[1];

    // ======================================
    // GET RELEASE DATE
    // ======================================

    const releaseBlock = html.match(
      /<p\b[^>]*\bclass=["'][^"']*\brelease\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i
    )?.[1];

    if (!titleBlock || !releaseBlock) {
      continue;
    }

    const title = plainText(titleBlock);
    const releaseText = plainText(releaseBlock);

    const releaseDate = dateFromText(releaseText);

    if (!releaseDate) {
      console.warn(
        `SKIP ${filename}: Invalid release date (${releaseText})`
      );

      continue;
    }

    // ======================================
    // READ EMBEDDED ALBUM TRACK DATA
    // ======================================

    const albumDataBlock = html.match(
      /<script\b[^>]*\bid=["']album-data["'][^>]*>([\s\S]*?)<\/script>/i
    )?.[1];

    let tracks = [];

    if (albumDataBlock) {
      try {
        const data = JSON.parse(albumDataBlock);

        if (Array.isArray(data.tracks)) {
          tracks = data.tracks;
        }
      } catch (error) {
        console.warn(
          `WARN ${filename}: Cannot parse album track data.`
        );
      }
    }

    // ======================================
    // STORE ALBUM INFORMATION
    // ======================================

    albums.push({
      title,
      releaseDate,
      titleKey: normalize(title),

      files: new Set(
        tracks
          .map(track =>
            audioKey(track?.src || track?.file)
          )
          .filter(Boolean)
      ),

      titles: new Set(
        tracks
          .map(track => normalize(track?.title))
          .filter(Boolean)
      )
    });
  }

  return albums;
}

// ==========================================
// CHECK IF SONG BELONGS TO ALBUM
// ==========================================

function belongsToAlbum(song, album) {
  const file = audioKey(song.file);
  const title = normalize(song.title);

  return (
    (file && album.files.has(file)) ||
    (title && album.titles.has(title)) ||
    albumNames(song).includes(album.titleKey)
  );
}

// ==========================================
// UPDATE SONG DETAILS
// ==========================================

function main() {
  const original = fs.readFileSync(
    DETAILS_FILE,
    "utf8"
  );

  const songs = JSON.parse(original);

  if (!Array.isArray(songs)) {
    throw new Error(
      "song-details.json must contain an array."
    );
  }

  const albums = loadAlbums();

  console.log(
    `Found ${albums.length} album pages with valid dates.`
  );

  let updated = 0;
  let matched = 0;

  // ========================================
  // CHECK EVERY SONG
  // ========================================

  for (const song of songs) {
    if (!song || typeof song !== "object") {
      continue;
    }

    const candidateAlbums = albums.filter(album =>
      belongsToAlbum(song, album)
    );

    if (candidateAlbums.length === 0) {
      continue;
    }

    matched++;

    // If a song belongs to multiple albums,
    // use its earliest album release date.

    candidateAlbums.sort((a, b) =>
      a.releaseDate.localeCompare(b.releaseDate)
    );

    const chosen = candidateAlbums[0];

    if (
      candidateAlbums.some(album =>
        album.releaseDate !== chosen.releaseDate
      )
    ) {
      console.log(
        `MULTIPLE ALBUMS: ${song.title} -> ` +
        `${chosen.releaseDate} (${chosen.title})`
      );
    }

    // Skip songs that already have the correct date.

    if (song.releaseDate === chosen.releaseDate) {
      continue;
    }

    console.log(
      `${song.title}: ` +
      `${song.releaseDate || "(blank)"} -> ` +
      `${chosen.releaseDate} [${chosen.title}]`
    );

    song.releaseDate = chosen.releaseDate;
    updated++;
  }

  // ========================================
  // SUMMARY
  // ========================================

  console.log(
    `Matched ${matched} songs; ` +
    `${updated} release dates need updating.`
  );

  // ========================================
  // DRY RUN
  // ========================================

  if (DRY_RUN) {
    console.log(
      "DRY RUN: No files were changed."
    );
    return;
  }

  if (updated === 0) {
    console.log("No changes necessary.");
    return;
  }

  // ========================================
  // BACKUP ORIGINAL JSON
  // ========================================

  const backup = `${DETAILS_FILE}.bak`;

  if (!fs.existsSync(backup)) {
    fs.copyFileSync(DETAILS_FILE, backup);

    console.log(
      `Backup created: ${path.relative(ROOT, backup)}`
    );
  }

  // ========================================
  // PRESERVE LINE ENDINGS
  // ========================================

  const newline = original.includes("\r\n")
    ? "\r\n"
    : "\n";

  const trailingNewline = /\r?\n$/.test(original)
    ? newline
    : "";

  // ========================================
  // SAVE UPDATED JSON
  // ========================================

  const serialized =
    JSON.stringify(songs, null, 2)
      .replace(/\n/g, newline) +
    trailingNewline;

  fs.writeFileSync(
    DETAILS_FILE,
    serialized,
    "utf8"
  );

  console.log(
    "Updated audioPlayer/audio/song-details.json successfully."
  );
}

// ==========================================
// EXECUTE
// ==========================================

try {
  main();
} catch (error) {
  console.error(
    "Update failed:",
    error.message
  );

  process.exitCode = 1;
}
