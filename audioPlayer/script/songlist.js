/* ==========================================
   LEGACY SONG LINK NOTICE
   Older /audioPlayer/pages/<slug>.html links remain usable, but
   visitors choose when to open the maintained song.html?id=<slug> route.
   No automatic redirects or dependency on Firebase.
========================================== */
(function showLegacySongNotice(){
  const pageId=document.body?.dataset?.songId;
  if(!pageId)return; // Do not show on the current song.html page.

  const destination=new URL("song.html",window.location.href);
  destination.searchParams.set("id",pageId);

  const style=document.createElement("style");
  style.textContent=`
    .ptg-legacy-dialog {
      position:fixed;inset:0;margin:auto;max-width:min(510px,calc(100% - 32px));
      box-sizing:border-box;padding:clamp(20px,5vw,32px);
      border:2px solid #c084fc;border-radius:18px;
      background:#1c2333;color:#f8fafc;
      box-shadow:0 24px 90px #000b;text-align:left;
      font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;
    }
    .ptg-legacy-dialog::backdrop {background:rgba(4,7,18,.83);}
    .ptg-legacy-dialog h2 {font-size:1.55rem;color:#e9d5ff;margin:0 0 12px;}
    .ptg-legacy-dialog p {margin:0 0 19px;color:#dbe4ef;}
    .ptg-legacy-actions {display:flex;flex-wrap:wrap;gap:11px;}
    .ptg-legacy-dialog button {
      flex:1 1 185px;min-height:44px;border:1px solid #bd9aff;
      border-radius:9px;cursor:pointer;padding:10px 14px;
      background:#a78bfa;color:#151020;font:700 1rem system-ui,sans-serif;
    }
    .ptg-legacy-dialog button.ptg-legacy-stay {
      background:#293246;color:#f7f5ff;border-color:#7d849e;
    }
    .ptg-legacy-dialog button:focus-visible {
      outline:3px solid #22d3ee;outline-offset:3px;
    }
    @media (max-width:480px){.ptg-legacy-dialog{font-size:15px;}}
  `;
  document.head.append(style);

  const dialog=document.createElement("dialog");
  dialog.className="ptg-legacy-dialog";
  dialog.setAttribute("aria-labelledby","ptg-legacy-title");
  dialog.setAttribute("aria-describedby","ptg-legacy-explanation");
  const title=document.createElement("h2");
  title.id="ptg-legacy-title";
  title.textContent="This song link is deprecated";
  const explanation=document.createElement("p");
  explanation.id="ptg-legacy-explanation";
  explanation.textContent="You opened an older PrincessTG song page. " +
    "The updated song page has the latest navigation and features. " +
    "Would you like to go there now?";
  const actions=document.createElement("div");
  actions.className="ptg-legacy-actions";
  const go=document.createElement("button");
  go.type="button";
  go.textContent="Open updated song page";
  go.addEventListener("click",()=>window.location.assign(destination.href));
  const stay=document.createElement("button");
  stay.type="button";stay.className="ptg-legacy-stay";
  stay.textContent="Stay on old page";
  stay.addEventListener("click",()=>{
    if(typeof dialog.close==="function")dialog.close();
    else dialog.remove();
  });
  actions.append(go,stay);
  dialog.append(title,explanation,actions);
  document.body.append(dialog);
  if(typeof dialog.showModal==="function")dialog.showModal();
  else dialog.setAttribute("open","");
})();

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
    
const { loadSong } = await import(
  "../../script/song-data.js"
);

const song = await loadSong(
  pageIdFromUrl,
  titleFromUrl,
  "../audio/song-details.json"
);


console.log("========== SONG DATABASE TEST ==========");
console.log("Requested page ID:", pageIdFromUrl);
console.log("Requested title:", titleFromUrl);
console.log("Merged song data:", song);
console.log("Description:", song?.description);
console.log("========================================");



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

  } catch (error) {
    console.error(
      "SONG DETAILS LOADING FAILED:",
      error
    );
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

    // ==========================================
    // LOAD SONG FROM JSON AND FIRESTORE
    // ==========================================

    const params = new URLSearchParams(
      window.location.search
    );

    const songId =
      params.get("pageId") ||
      document.body.dataset.songId;

    const songTitle =
      params.get("title") ||
      document.body.dataset.songTitle;

    const { loadSong } = await import(
      "../../script/song-data.js"
    );

    // ==========================================
    // LOAD AUDIO INDEX AND SONG DETAILS
    // ==========================================

    const [indexResponse, song] = await Promise.all([
      fetch("../audio/index.json"),

      loadSong(
        songId,
        songTitle,
        "../audio/song-details.json"
      )
    ]);

    if (!indexResponse.ok) {
      throw new Error(
        "Could not check audio availability."
      );
    }

    const audioIndex = await indexResponse.json();

    if (!Array.isArray(audioIndex)) {
      throw new Error("Invalid audio index.");
    }


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
