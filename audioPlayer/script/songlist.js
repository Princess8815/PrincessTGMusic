async function loadSongs() {
  const response = await fetch("audio/index.json");
  const songs = await response.json();

  console.log(songs);
}

const params = new URLSearchParams(window.location.search);
const title = params.get("title");

const titleElement = document.getElementById("songTitle");

if (titleElement && title) {
  titleElement.textContent = title;
}

async function loadSongDetails() {
  const params = new URLSearchParams(window.location.search);
  const titleFromUrl = params.get("title");

  if (!titleFromUrl) return;

  try {
    const response = await fetch("../audio/song-details.json");
    if (!response.ok) return;

    const songs = await response.json();

    const song = songs.find(
      (s) => s.title.toLowerCase() === titleFromUrl.toLowerCase()
    );

    let filePath = `../audio/${titleFromUrl}.mp3`;

    if (song) {
      if (song.file) {
        filePath = song.file;
      }

      const titleElement = document.getElementById("songTitle");
      const desc = document.getElementById("songDescription");
      const album = document.getElementById("songAlbum");
      const date = document.getElementById("songDate");
      const lyrics = document.getElementById("songLyrics");

      if (lyrics) lyrics.textContent = song.lyrics || "No lyrics available.";
      if (titleElement) titleElement.textContent = song.title;
      if (desc) desc.textContent = song.description || "";
      if (album) album.textContent = song.album || "";
      if (date) date.textContent = song.releaseDate || "";
    }

    const playBtn = document.getElementById("playSong");
    const stopBtn = document.getElementById("stopSong");
    const player = document.getElementById("songPlayer");

    if (playBtn && player) {
      playBtn.addEventListener("click", () => {
        player.src = filePath;
        player.play();
      });
    }

    if (stopBtn && player) {
        stopBtn.addEventListener("click", () => {
            player.pause();
            player.currentTime = 0;
        });
    }

  } catch {
    /* silent fail */
  }
}

loadSongDetails();