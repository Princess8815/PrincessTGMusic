const SITE_URL = "https://princess8815.github.io/PrincessTGMusic";
const LOGO_URL = `${SITE_URL}/images/logo%20avatar.png`;
const SITE_URL = "https://princess8815.github.io/PrincessTGMusic";
const LOGO_URL = `${SITE_URL}/images/logo%20avatar.png`;

const params = new URLSearchParams(window.location.search);
const title = params.get("title") || document.body.dataset.songTitle;
const titleElement = document.getElementById("songTitle");

const setMetaContent = (selector, content) => {
  const element = document.querySelector(selector);
  if (element && content) {
    element.setAttribute("content", content);
  }
};

const updateSongMeta = ({ title: songTitle, description, url }) => {
  const pageTitle = `${songTitle} by PrincessTG`;
  const metaDescription = description || `Listen to ${songTitle} by PrincessTG.`;

  document.title = pageTitle;
  setMetaContent('meta[name="description"]', metaDescription);
  setMetaContent('meta[property="og:title"]', pageTitle);
  setMetaContent('meta[property="og:description"]', metaDescription);
  setMetaContent('meta[property="og:url"]', url);
  setMetaContent('meta[property="og:image"]', LOGO_URL);
  setMetaContent('meta[name="twitter:title"]', pageTitle);
  setMetaContent('meta[name="twitter:description"]', metaDescription);
  setMetaContent('meta[name="twitter:image"]', LOGO_URL);
};

if (titleElement && title) {
  titleElement.textContent = title;
  updateSongMeta({
    title,
    url: window.location.href,
  });
}

async function loadSongDetails() {
  const params = new URLSearchParams(window.location.search);
  const titleFromUrl = params.get("title") || document.body.dataset.songTitle;

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

      updateSongMeta({
        title: song.title,
        description: song.description,
        url: window.location.href,
      });
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
