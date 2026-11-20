
const fs = require("node:fs");
const path = require("node:path");

// ==========================================
// FILE LOCATION
// ==========================================

const DETAILS_FILE = path.join(
  __dirname,
  "audioPlayer",
  "audio",
  "song-details.json"
);

// ==========================================
// LOAD SONG DETAILS
// ==========================================

function alphabetizeSongs() {
  if (!fs.existsSync(DETAILS_FILE)) {
    console.error("song-details.json was not found.");
    return;
  }

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

  // ========================================
  // SORT SONGS ALPHABETICALLY
  // ========================================

  songs.sort((a, b) => {
    const titleA = String(a?.title || "");
    const titleB = String(b?.title || "");

    return titleA.localeCompare(
      titleB,
      "en",
      {
        sensitivity: "base",
        numeric: true
      }
    );
  });

  // ========================================
  // PRESERVE FILE FORMATTING
  // ========================================

  const newline = original.includes("\r\n")
    ? "\r\n"
    : "\n";

  const trailingNewline = /\r?\n$/.test(original)
    ? newline
    : "";

  // ========================================
  // SAVE ALPHABETIZED SONG DETAILS
  // ========================================

  const output = JSON.stringify(songs, null, 2)
    .replace(/\n/g, newline) +
    trailingNewline;

  if (output === original) {
    console.log(
      "Songs are already alphabetized."
    );
    return;
  }

  // ========================================
  // CREATE BACKUP
  // ========================================

  const backupFile = DETAILS_FILE + ".bak";

  if (!fs.existsSync(backupFile)) {
    fs.copyFileSync(DETAILS_FILE, backupFile);
  }

  fs.writeFileSync(
    DETAILS_FILE,
    output,
    "utf8"
  );

  console.log(
    `Successfully alphabetized ${songs.length} songs!`
  );
}

// ==========================================
// RUN SCRIPT
// ==========================================

try {
  alphabetizeSongs();
} catch (error) {
  console.error("Error:", error.message);
  process.exitCode = 1;
}
