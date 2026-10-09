
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const FILE = "./audioPlayer/audio/song-details.json";

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

// Clean lyrics before saving

function cleanLyrics(lyrics) {
  return String(lyrics ?? "")
    // Remove ALL square bracket tags, including multiline tags
    .replace(/\[[\s\S]*?\]/g, "")

    // Remove parentheses but KEEP the text inside
    .replace(/[()]/g, "")

    // Split into individual lines
    .split(/\r?\n/)

    .map((line) => {
      // Remove extra spaces
      line = line.trim();

      // Keep blank lines for separating verses
      if (!line) return "";

      // Make all letters lowercase
      line = line.toLowerCase();

      // Capitalize only the first letter of each line
      line = line.replace(
        /[a-z]/,
        (letter) => letter.toUpperCase()
      );

      return line;
    })

    // Put lyrics back together
    .join("\n")

    // Remove excess blank lines (maximum one blank line)
    .replace(/\n{3,}/g, "\n\n")

    // Remove leading and trailing whitespace
    .trim();
}



const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: Boolean(process.stdin.isTTY)
});

// Collect every input line in one place.
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

async function getLyrics() {
  console.log("\nPaste lyrics below.");
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


function cleanLyrics(lyrics) {
  return String(lyrics ?? "")
    // Remove bracket-only lines including their newline
    .replace(/^[ \t]*\[[^\]\r\n]*\][ \t]*(?:\r?\n|$)/gm, "")

    // Remove any remaining bracket tags
    .replace(/\[[\s\S]*?\]/g, "")

    // Remove parentheses but keep the text inside
    .replace(/[()]/g, "")

    .split(/\r?\n/)
    .map((line) => {
      line = line.trim();

      if (!line) return "";

      line = line.toLowerCase();

      return line.replace(
        /[a-z]/,
        (letter) => letter.toUpperCase()
      );
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


async function main() {
  try {
    const title = await ask("Song title: ");
    const description = await ask("Description: ");
    const album = await ask("Album: ");
    const releaseDate = await ask("Release date (YYYY-MM-DD): ");

    const rawLyrics = await getLyrics();
    const lyrics = cleanLyrics(rawLyrics);

    console.log("\n--- CLEANED LYRICS PREVIEW ---");
    console.log(lyrics);
    console.log("--- END PREVIEW ---\n");

    const confirm = await ask("Save this song? (y/n): ");

    if (confirm.toLowerCase() !== "y") {
      console.log("Song not saved.");
      return;
    }

    let songs = [];

    if (fs.existsSync(FILE)) {
      songs = JSON.parse(fs.readFileSync(FILE, "utf8"));

      if (!Array.isArray(songs)) {
        throw new Error("Song details must be a JSON array.");
      }
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

    songs.push(newSong);

    fs.mkdirSync(path.dirname(FILE), {
      recursive: true
    });

    fs.writeFileSync(
      FILE,
      JSON.stringify(songs, null, 2),
      "utf8"
    );

    console.log("\nSong added successfully!");
    console.log(
      `Page file: audioPlayer/pages/${newSong.pageId}.html`
    );

  } catch (err) {
    console.error("Error:", err);
  } finally {
    rl.close();
  }
}

main();

