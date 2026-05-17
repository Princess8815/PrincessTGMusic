const fs = require("fs");
const readline = require("readline");

const FILE = "./audioPlayer/audio/song-details.json";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function getLyrics() {
  console.log("\nPaste lyrics below.");
  console.log("Type END on its own line when finished:\n");

  const lines = [];

  return new Promise((resolve) => {
    rl.on("line", (line) => {
      if (line.trim() === "END") {
        resolve(lines.join("\n"));
      } else {
        lines.push(line);
      }
    });
  });
}

async function main() {
  try {
    const title = await ask("Song title: ");
    const description = await ask("Description: ");
    const album = await ask("Album: ");
    const releaseDate = await ask("Release date (YYYY-MM-DD): ");

    const lyrics = await getLyrics();

    let songs = [];

    if (fs.existsSync(FILE)) {
      songs = JSON.parse(fs.readFileSync(FILE, "utf8"));
    }

    const newSong = {
      title,
      file: `../audio/${title}.mp3`,
      description,
      album,
      releaseDate,
      lyrics
    };

    songs.push(newSong);

    fs.writeFileSync(FILE, JSON.stringify(songs, null, 2), "utf8");

    console.log("\nSong added successfully.");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    rl.close();
  }
}

main();