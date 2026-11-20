
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const FILE = "./audioPlayer/audio/song-details.json";
const TRANSLATION_FILE = "./data/translation.json";

function slugify(title) {
  return String(title ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "song";
}

function makeUniquePageId(title, songs) {
  const basePageId = slugify(title);

  const usedPageIds = new Set(
    songs
      .map((song) => slugify(song.pageId || song.title))
      .filter(Boolean)
  );

  let pageId = basePageId;
  let suffix = 2;

  while (usedPageIds.has(pageId)) {
    pageId = `${basePageId}-${suffix}`;
    suffix++;
  }

  return pageId;
}

// Clean lyrics while preserving foreign characters.
function cleanLyrics(lyrics) {
  return String(lyrics ?? "")
    // Remove bracket-only lines.
    .replace(/^[ \t]*\[[^\]\r\n]*\][ \t]*(?:\r?\n|$)/gm, "")

    // Remove remaining bracket tags.
    .replace(/\[[\s\S]*?\]/g, "")

    // Remove parentheses but keep their text.
    .replace(/[()]/g, "")

    .split(/\r?\n/)
    .map((line) => {
      line = line.trim();

      if (!line) return "";

      // Lowercase Unicode letters, then capitalize
      // the first letter in the line.
      line = line.toLocaleLowerCase();

      return line.replace(
        /\p{L}/u,
        (letter) => letter.toLocaleUpperCase()
      );
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: Boolean(process.stdin.isTTY)
});

const pendingLines = [];
const waitingResolvers = [];

rl.on("line", (line) => {
  if (waitingResolvers.length) {
    waitingResolvers.shift()(line);
  } else {
    pendingLines.push(line);
  }
});

function nextLine() {
  if (pendingLines.length) {
    return Promise.resolve(pendingLines.shift());
  }

  return new Promise((resolve) => {
    waitingResolvers.push(resolve);
  });
}

async function ask(question) {
  process.stdout.write(question);
  return (await nextLine()).trim();
}

async function askYesNo(question) {
  while (true) {
    const answer = (await ask(question)).toLowerCase();

    if (answer === "y" || answer === "yes") {
      return true;
    }

    if (answer === "n" || answer === "no") {
      return false;
    }

    console.log("Please enter y or n.");
  }
}

async function getLyrics(label = "lyrics") {
  console.log(`\nPaste ${label} below.`);
  console.log("Type END on its own line when finished:\n");

  const lines = [];

  while (true) {
    const line = await nextLine();

    if (line.trim() === "END") {
      break;
    }

    lines.push(line);
  }

  return lines.join("\n");
}

function loadJSON(file, fallback) {
  if (!fs.existsSync(file)) {
    return fallback;
  }

  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function saveJSON(file, data) {
  fs.mkdirSync(path.dirname(file), {
    recursive: true
  });

  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

async function main() {
  try {

const title = await ask("Song title: ");
const description = await ask("Description: ");

// ==========================================
// ALBUM SELECTION
// ==========================================

const albumInput = await ask("Album (S for Single): ");

const album =
  albumInput.toLowerCase() === "s" ||
  albumInput.toLowerCase() === "single"
    ? "Single"
    : albumInput;

// ==========================================
// RELEASE DATE
// ==========================================

let releaseDate = "tbd";

// Only singles ask for a release date.
if (album === "Single") {
  releaseDate = await ask("Release date (YYYY-MM-DD): ");
}


    // Original lyrics.
    const rawLyrics = await getLyrics("original lyrics");
    const lyrics = cleanLyrics(rawLyrics);

    console.log("\n--- CLEANED LYRICS PREVIEW ---");
    console.log(lyrics);
    console.log("--- END PREVIEW ---\n");

    // Ask whether the song needs translation.
    const needsTranslation = await askYesNo(
      "Does this song need an English translation? (y/n): "
    );

    let englishLyrics = null;

    if (needsTranslation) {
      const rawEnglishLyrics = await getLyrics(
        "the English-only translation"
      );

      englishLyrics = cleanLyrics(rawEnglishLyrics);

      if (!englishLyrics) {
        throw new Error(
          "English translation cannot be empty."
        );
      }

      console.log("\n--- ENGLISH TRANSLATION PREVIEW ---");
      console.log(englishLyrics);
      console.log("--- END TRANSLATION PREVIEW ---\n");
    }

    const confirm = await askYesNo(
      "Save this song? (y/n): "
    );

    if (!confirm) {
      console.log("Song not saved.");
      return;
    }

    // Load existing songs.
    const songs = loadJSON(FILE, []);

    if (!Array.isArray(songs)) {
      throw new Error(
        "Song details must be a JSON array."
      );
    }

    const newSong = {
      title,
      pageId: makeUniquePageId(title, songs),
      file: `../audio/${title}.mp3`,
      description,
      album,
      releaseDate,
      lyrics
    };

    // Prepare translation before writing files.
    let translations = null;

    if (needsTranslation) {
      translations = loadJSON(TRANSLATION_FILE, {});

      if (
        translations === null ||
        typeof translations !== "object" ||
        Array.isArray(translations)
      ) {
        throw new Error(
          "Translation JSON must be an object."
        );
      }

      // Use the song title as the key.
      if (Object.hasOwn(translations, title)) {
        throw new Error(
          `A translation already exists for "${title}".`
        );
      }

      translations[title] = englishLyrics;
    }

    songs.push(newSong);

    // Save song details.
    saveJSON(FILE, songs);

    // Save translation separately.
    if (needsTranslation) {
      saveJSON(TRANSLATION_FILE, translations);
    }

    console.log("\nSong added successfully!");

    console.log(
      `Page file: audioPlayer/pages/${newSong.pageId}.html`
    );

    console.log(`Release date: ${releaseDate}`);

    if (needsTranslation) {
      console.log(
        `English translation saved in ${TRANSLATION_FILE}`
      );
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    rl.close();
  }
}

main();
