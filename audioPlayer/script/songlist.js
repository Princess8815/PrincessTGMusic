const SITE_URL = "https://princess8815.github.io/PrincessTGMusic";
const LOGO_URL = `${SITE_URL}/images/logo%20avatar.png`;


const params = new URLSearchParams(window.location.search);
const pageId = params.get("pageId") || document.body.dataset.songId;
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
  const pageIdFromUrl = params.get("pageId") || document.body.dataset.songId;
  const titleFromUrl = params.get("title") || document.body.dataset.songTitle;

  if (!pageIdFromUrl && !titleFromUrl) return;

  try {
    const response = await fetch("../audio/song-details.json");
    if (!response.ok) return;

    const songs = await response.json();

    const normalizedPageId = pageIdFromUrl?.toLowerCase();
    const normalizedTitle = titleFromUrl?.toLowerCase();
    const song = songs.find((s) => {
      const songPageId = s.pageId?.toLowerCase();
      const songTitle = s.title?.toLowerCase();
      return (normalizedPageId && songPageId === normalizedPageId) || (normalizedTitle && songTitle === normalizedTitle);
    });

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


/* ==========================================
   DISABLE PLAYER FOR RELEASED SONGS
========================================== */

async function checkReleasedSongPlayback() {
  const player = document.getElementById("songPlayer");

  if (!player) return;

  const playButton = document.getElementById("playSong");
  const stopButton = document.getElementById("stopSong");

  // Disable playback while checking availability.
  player.controls = false;

  if (playButton) playButton.disabled = true;
  if (stopButton) stopButton.disabled = true;

  function enablePlayer() {
    player.controls = true;

    if (playButton) playButton.disabled = false;
    if (stopButton) stopButton.disabled = false;
  }

  function fileKey(path) {
    return String(path || "")
      .split(/[\\/]/)
      .pop()
      .split(/[?#]/)[0]
      .replace(/\.[^.]+$/, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  try {
    const [indexResponse, detailsResponse] =
      await Promise.all([
        fetch("../audio/index.json"),
        fetch("../audio/song-details.json")
      ]);

    if (!indexResponse.ok || !detailsResponse.ok) {
      throw new Error("Could not check audio availability.");
    }

    const audioIndex = await indexResponse.json();
    const songDetails = await detailsResponse.json();

    if (!Array.isArray(audioIndex) ||
        !Array.isArray(songDetails)) {
      throw new Error("Invalid audio data.");
    }

    const songId = document.body.dataset.songId;
    const songTitle = document.body.dataset.songTitle;

    const song = songDetails.find(item =>
      (songId && item.pageId === songId) ||
      (songTitle && item.title === songTitle)
    );

    if (!song || !song.file) {
      enablePlayer();
      return;
    }

    const songFile = fileKey(song.file);

    const isAvailable = audioIndex.some(path =>
      fileKey(typeof path === "string" ? path : path?.file)
        === songFile
    );

    if (isAvailable) {
      enablePlayer();
      return;
    }

    // Song is no longer listed in index.json.
    // Remove the playable controls.

    player.pause();
    player.removeAttribute("src");
    player.load();

    const playerSection = player.closest(".now-playing");

    if (playerSection) {
      const notice = document.createElement("p");

      notice.className = "status";

      notice.textContent =
        "This song has been released. " +
        "On-site audio playback is disabled. " +
        "Please listen on your favorite streaming platform.";

      playerSection.replaceChildren(notice);
    }

  } catch (error) {
    console.warn("Audio availability check failed:", error);

    // Keep existing playback available if the
    // availability files could not be checked.
    enablePlayer();
  }
}

checkReleasedSongPlayback();


loadSongDetails();
