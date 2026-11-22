import {
  getPlaylists, savePlaylists, createPlaylist as createNamedPlaylist,
  deletePlaylist as deleteNamedPlaylist, addToPlaylistControl
} from "../../script/music-playlists.js";
import {auth} from "../../script/firebase.js";
import {wireDragReorder} from "../../script/drag-reorder.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
const AUDIO_INDEX = "audio/index.json";
const SONG_DETAILS = "audio/song-details.json";
const ORDER_STORAGE_KEY = "audio-player-order-v1";
const DISABLED_STORAGE_KEY = "audio-player-disabled-v1";
const PLAYLISTS_STORAGE_KEY = "audio-player-custom-playlists-v1";
const SELECTED_PLAYLIST_STORAGE_KEY = "audio-player-selected-playlist-v1";
const UNCATEGORIZED_ALBUM = "Uncategorized";

const playlistElement = document.getElementById("playlist");
const playerElement = document.getElementById("player");
const nowPlayingElement = document.getElementById("nowPlaying");
const statusElement = document.getElementById("status");
const playButton = document.getElementById("playBtn");
const stopButton = document.getElementById("stopBtn");
const refreshButton = document.getElementById("refreshBtn");
const resetOrderButton = document.getElementById("orderResetBtn");
const albumFilterElement = document.getElementById("albumFilter");
const sortSelectElement = document.getElementById("sortSelect");
const playlistSelectElement = document.getElementById("playlistSelect");
const newPlaylistNameElement = document.getElementById("newPlaylistName");
const createPlaylistButton = document.getElementById("createPlaylistBtn");
const deletePlaylistButton = document.getElementById("deletePlaylistBtn");
const playlistHelpElement = document.getElementById("playlistHelp");

let tracks = [];
let visibleTracks = [];
let currentPath = "";
let isStopped = true;
let disabledTracks = new Set();
let customPlaylists = [];
let selectedPlaylistId = "all";
let currentAlbumFilter = "all";
let currentSort = "custom";

const readJsonStorage = (key, fallback) => {
	try {
		return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback));
	} catch {
		return fallback;
	}
};

const saveJsonStorage = (key, value) => {
	localStorage.setItem(key, JSON.stringify(value));
};


const slugifyTitle = (title) => title
	.toLowerCase()
	.normalize("NFKD")
	.replace(/[\u0300-\u036f]/g, "")
	.replace(/[^a-z0-9]+/g, "-")
	.replace(/^-+|-+$/g, "") || "song";

const prettifyName = (path) => {
	const slashIdx = path.lastIndexOf("/");
	const dotIdx = path.lastIndexOf(".");
	return path.substring(slashIdx + 1, dotIdx);
};

const normalizeAlbums = (album) => {
	const albums = (album ?? "")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
	return albums.length ? albums : [UNCATEGORIZED_ALBUM];
};

const formatAlbums = (albums) => albums.join(", ");

const normalizeMainAudioPath = (path) => path.replace(/^\.\.\//, "");

const makePlaylistId = () => `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getSelectedPlaylist = () => customPlaylists.find((playlist) => playlist.id === selectedPlaylistId);

const isCustomPlaylistSelected = () => Boolean(getSelectedPlaylist());

const setStatus = (message) => {
	statusElement.textContent = message;
};

const getSavedOrder = () => readJsonStorage(ORDER_STORAGE_KEY, []);

const saveOrder = () => {
	saveJsonStorage(ORDER_STORAGE_KEY, tracks.map((track) => track.path));
};

const applySavedOrder = (trackList) => {
	const rank = new Map(getSavedOrder().map((path, index) => [path, index]));

	return [...trackList].sort((a, b) => {
		const aRank = rank.has(a.path) ? rank.get(a.path) : Number.MAX_SAFE_INTEGER;
		const bRank = rank.has(b.path) ? rank.get(b.path) : Number.MAX_SAFE_INTEGER;

		if (aRank !== bRank) {
			return aRank - bRank;
		}

		return a.title.localeCompare(b.title);
	});
};

const isTrackInSelectedPlaylist = (track) => {
	const selectedPlaylist = getSelectedPlaylist();
	return !selectedPlaylist || selectedPlaylist.tracks.includes(track.path);
};

const getPlayableTracks = () => visibleTracks.filter((track) => !disabledTracks.has(track.path) && isTrackInSelectedPlaylist(track));

const getCurrentPlayableIndex = () => getPlayableTracks().findIndex((track) => track.path === currentPath);

const updateActiveTrack = () => {
	[...playlistElement.querySelectorAll(".track")].forEach((row) => {
		row.classList.toggle("active", row.dataset.path === currentPath && !isStopped);
	});
};

const loadTrackByPath = (path, autoplay = true) => {
	const track = tracks.find((item) => item.path === path);
	if (!track || disabledTracks.has(track.path)) {
		return;
	}

	currentPath = track.path;
	isStopped = false;
	playerElement.src = track.path;
	nowPlayingElement.textContent = `${track.title} — ${formatAlbums(track.albums)}`;
	updateActiveTrack();

	if (autoplay) {
		void playerElement.play();
	}
};

const stopPlayback = () => {
	isStopped = true;
	playerElement.pause();
	playerElement.currentTime = 0;
	nowPlayingElement.textContent = "Stopped";
	updateActiveTrack();
};

const playFromCurrentOrTop = () => {
	const playableTracks = getPlayableTracks();
	if (!playableTracks.length) {
		setStatus("No enabled tracks match the current playlist and filters.");
		return;
	}

	const nextTrack = playableTracks.some((track) => track.path === currentPath)
		? tracks.find((track) => track.path === currentPath)
		: playableTracks[0];
	loadTrackByPath(nextTrack.path, true);
};

const goToNextTrack = () => {
	const playableTracks = getPlayableTracks();
	if (!playableTracks.length) {
		stopPlayback();
		return;
	}

	const currentPlayableIndex = getCurrentPlayableIndex();
	const nextIndex = currentPlayableIndex < 0 ? 0 : (currentPlayableIndex + 1) % playableTracks.length;
	loadTrackByPath(playableTracks[nextIndex].path, !isStopped);
};

const sortTracks = (trackList) => {
	if (currentSort === "custom") {
		return trackList;
	}

	return [...trackList].sort((a, b) => {
		if (currentSort === "album") {
			return formatAlbums(a.albums).localeCompare(formatAlbums(b.albums)) || a.title.localeCompare(b.title);
		}

		if (currentSort === "releaseDate") {
			return (a.releaseDate || "9999").localeCompare(b.releaseDate || "9999") || a.title.localeCompare(b.title);
		}

		return a.title.localeCompare(b.title);
	});
};

const updateVisibleTracks = () => {
  const filtered = tracks.filter(track =>
    currentAlbumFilter === "all" || track.albums.includes(currentAlbumFilter)
  );
  const sorted = sortTracks(filtered);
  const chosen = getSelectedPlaylist();
  if (!chosen || currentSort !== "custom") {
    visibleTracks = sorted;
    return;
  }
  // In a personal playlist, use the saved playlist order for its songs.
  // Unchecked catalog songs stay visible afterwards so they can be added.
  const rank = new Map(chosen.tracks.map((path, index) => [path, index]));
  const inPlaylist = sorted.filter(track => rank.has(track.path))
    .sort((a, b) => rank.get(a.path) - rank.get(b.path));
  const otherSongs = sorted.filter(track => !rank.has(track.path));
  visibleTracks = [...inPlaylist, ...otherSongs];
};

const saveDisabledTracks = () => {
	saveJsonStorage(DISABLED_STORAGE_KEY, [...disabledTracks]);
};

const saveCustomPlaylists = () => {
  savePlaylists(customPlaylists);
};

const saveSelectedPlaylist = () => {
	localStorage.setItem(SELECTED_PLAYLIST_STORAGE_KEY, selectedPlaylistId);
};

const renderAlbumOptions = () => {
	const albums = [...new Set(tracks.flatMap((track) => track.albums))].sort((a, b) => a.localeCompare(b));
	albumFilterElement.innerHTML = "";
	albumFilterElement.append(new Option("All albums", "all"));
	albums.forEach((album) => albumFilterElement.append(new Option(album, album)));

	if (!["all", ...albums].includes(currentAlbumFilter)) {
		currentAlbumFilter = "all";
	}
	albumFilterElement.value = currentAlbumFilter;
};

const renderPlaylistOptions = () => {
	playlistSelectElement.innerHTML = "";
	playlistSelectElement.append(new Option("All enabled tracks", "all"));
	customPlaylists.forEach((playlist) => {
		playlistSelectElement.append(new Option(playlist.name, playlist.id));
	});

	if (selectedPlaylistId !== "all" && !getSelectedPlaylist()) {
		selectedPlaylistId = "all";
		saveSelectedPlaylist();
	}
	playlistSelectElement.value = selectedPlaylistId;
	deletePlaylistButton.disabled = !isCustomPlaylistSelected();
	playlistHelpElement.textContent = isCustomPlaylistSelected()
    ? "Drag a ☰ handle or use ↑ ↓ to reorder your playlist. Only checked songs belong to this playlist; unchecked songs remain below so you can add them."
    : "Drag a ☰ handle or use ↑ ↓ to reorder the full song list. Choose a playlist to manage its own saved order.";
};

const createTrackRow = (track, index) => {
	const item = document.createElement("li");
	const row = document.createElement("div");
	const titleBlock = document.createElement("div");
	const title = document.createElement("strong");
	const meta = document.createElement("div");
	const actions = document.createElement("div");
	const enabledLabel = document.createElement("label");
	const enabledInput = document.createElement("input");
	const playlistLabel = document.createElement("label");
	const playlistInput = document.createElement("input");
	const play = document.createElement("button");
	const details = document.createElement("button");
	const selectedPlaylist = getSelectedPlaylist();

	row.className = "track";
  // Use a dedicated handle so buttons and checkboxes stay clickable.
  const mayReorder = !selectedPlaylist || selectedPlaylist.tracks.includes(track.path);
	row.dataset.path = track.path;
	row.dataset.index = String(index);
	row.classList.toggle("track--disabled", disabledTracks.has(track.path));
	row.classList.toggle("track--not-in-playlist", Boolean(selectedPlaylist) && !selectedPlaylist.tracks.includes(track.path));
	titleBlock.className = "track__title";
	meta.className = "track__path";
	actions.className = "track__actions";
	enabledLabel.className = "track__toggle";
	playlistLabel.className = "track__toggle";

	title.textContent = track.title;
	meta.textContent = `${formatAlbums(track.albums)}${track.releaseDate ? ` • ${track.releaseDate}` : ""} • ${track.path}`;

	enabledInput.type = "checkbox";
	enabledInput.checked = !disabledTracks.has(track.path);
	enabledInput.addEventListener("change", () => {
		if (enabledInput.checked) {
			disabledTracks.delete(track.path);
		} else {
			disabledTracks.add(track.path);
			if (currentPath === track.path) {
				stopPlayback();
			}
		}
		saveDisabledTracks();
		renderPlaylist();
	});
	enabledLabel.append(enabledInput, " Enabled");

	playlistInput.type = "checkbox";
	playlistInput.disabled = !selectedPlaylist;
	playlistInput.checked = selectedPlaylist ? selectedPlaylist.tracks.includes(track.path) : true;
	playlistInput.addEventListener("change", () => {
		if (!selectedPlaylist) return;
		const playlistTracks = new Set(selectedPlaylist.tracks);
		if (playlistInput.checked) {
			playlistTracks.add(track.path);
		} else {
			playlistTracks.delete(track.path);
		}
		selectedPlaylist.tracks = [...playlistTracks];
		saveCustomPlaylists();
		renderPlaylist();
	});
	playlistLabel.append(playlistInput, " In playlist");

	play.className = "track__play";
	play.type = "button";
	play.textContent = "Play";
	play.disabled = disabledTracks.has(track.path) || !isTrackInSelectedPlaylist(track);
	play.addEventListener("click", () => loadTrackByPath(track.path, true));

	details.className = "track__details";
	details.type = "button";
	details.textContent = "Details";

details.addEventListener("click", () => {
  const pageId =
    track.pageId || slugifyTitle(track.title);

  window.location.href =
    `pages/song.html?id=${encodeURIComponent(pageId)}`;
});


	titleBlock.append(title, meta);
    actions.append(enabledLabel, playlistLabel, play, details,
      addToPlaylistControl(() => [track.path]));
  const handle = document.createElement("span");
  handle.textContent = "☰";
  handle.title = "Drag to reorder";
  const nearby = visibleTracks.filter(candidate =>
    !selectedPlaylist || selectedPlaylist.tracks.includes(candidate.path)
  );
  const rank = nearby.findIndex(candidate => candidate.path === track.path);
  function moveArrow(delta) {
    const other = nearby[rank + delta];
    if (other) reorderTracks(track.path, other.path);
  }
  if (mayReorder) {
    const up = document.createElement("button");
    up.type = "button"; up.textContent = "↑"; up.title = "Move " + track.title + " up";
    up.setAttribute("aria-label", up.title);
    up.disabled = rank <= 0;
    up.addEventListener("click", () => moveArrow(-1));
    const down = document.createElement("button");
    down.type = "button"; down.textContent = "↓"; down.title = "Move " + track.title + " down";
    down.setAttribute("aria-label", down.title);
    down.disabled = rank >= nearby.length - 1;
    down.addEventListener("click", () => moveArrow(1));
    actions.prepend(up, down);
    wireDragReorder(
      row, handle, track.path,
      selectedPlaylist ? "playlist:" + selectedPlaylist.id : "all-songs",
      reorderTracks
    );
  } else {
    handle.textContent = " ";
    handle.title = "Check In playlist to add this song before reordering";
    handle.style.width = "28px";
  }
  row.append(handle, titleBlock, actions);
  item.append(row);
  return item;
};

const renderPlaylist = () => {
	updateVisibleTracks();
	playlistElement.innerHTML = "";
	visibleTracks.forEach((track, index) => playlistElement.appendChild(createTrackRow(track, index)));
	updateActiveTrack();
	const enabledCount = getPlayableTracks().length;
	const playlistNote = isCustomPlaylistSelected() ? " in this playlist" : "";
	setStatus(`Showing ${visibleTracks.length} track${visibleTracks.length === 1 ? "" : "s"}; ${enabledCount} enabled for playback${playlistNote}.`);
};

const reorderTracks = (fromPath, toPath) => {
  if (!fromPath || !toPath || fromPath === toPath) return;
  const chosen = getSelectedPlaylist();
  // The order being dragged is the currently VISIBLE list, even when
  // another sort or album filter was selected. Reordering activates Custom.
  const displayed = visibleTracks
    .filter(track => !chosen || chosen.tracks.includes(track.path))
    .map(track => track.path);
  const from = displayed.indexOf(fromPath);
  const to = displayed.indexOf(toPath);
  if (from < 0 || to < 0) return;

  const reordered = [...displayed];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0);
  const visibleSet = new Set(displayed);
  let cursor = 0;

  currentSort = "custom";
  sortSelectElement.value = "custom";

  if (chosen) {
    // Update only the selected playlist, not the global song order.
    // Retain songs hidden by the album filter and records without MP3s.
    chosen.tracks = chosen.tracks.map(path =>
      visibleSet.has(path) ? reordered[cursor++] : path
    );
    saveCustomPlaylists();
  } else {
    // Update the global player order without disturbing filtered-out songs.
    const lookup = new Map(tracks.map(track => [track.path, track]));
    tracks = tracks.map(track =>
      visibleSet.has(track.path) ? lookup.get(reordered[cursor++]) : track
    );
    saveOrder();
  }
  renderPlaylist();
};

const loadTracks = async () => {
	setStatus("Loading audio index...");

	try {
		
        // ==========================================
        // LOAD SONG DETAILS FROM JSON AND FIRESTORE
        // ==========================================

        const { loadAllSongs } = await import(
          "../../script/song-data.js"
        );

        const [indexResponse, details] = await Promise.all([
          fetch(AUDIO_INDEX, { cache: "no-store" }),
          loadAllSongs(SONG_DETAILS)
        ]);

        if (!indexResponse.ok) {
          throw new Error(
            `Audio index error: ${indexResponse.status}`
          );
        }

        const paths = await indexResponse.json();

		if (!paths || paths.length === 0) throw new Error("No audio files found in audio/index.json");

		const detailsByTitle = new Map(details.map((song) => [song.title.toLowerCase(), song]));
		const detailsByPath = new Map(details.filter((song) => song.file).map((song) => [normalizeMainAudioPath(song.file), song]));

		tracks = applySavedOrder(paths.map((path) => {
			const title = prettifyName(path);
			const detail = detailsByPath.get(path) ?? detailsByTitle.get(title.toLowerCase()) ?? {};
			return {
				path,
				title: detail.title || title,
				pageId: detail.pageId || slugifyTitle(detail.title || title),
				albums: normalizeAlbums(detail.album),
				releaseDate: detail.releaseDate || "",
			};
		}));

		disabledTracks = new Set(readJsonStorage(DISABLED_STORAGE_KEY, []).filter((path) => paths.includes(path)));
        // Shared playlists also include song-only items with no MP3.
        // Do not filter those out or overwrite their saved contents.
        customPlaylists = getPlaylists();
		selectedPlaylistId = localStorage.getItem(SELECTED_PLAYLIST_STORAGE_KEY) || "all";
		renderAlbumOptions();
		renderPlaylistOptions();
		renderPlaylist();
	} catch (error) {
		tracks = [];
		visibleTracks = [];
		renderPlaylist();
		setStatus(`Error: (${error.message})`);
	}
};

// Add a whole selected album to a personal playlist without leaving this page.
const albumPlaylistAction = addToPlaylistControl(
  () => currentAlbumFilter === "all" ? [] :
    tracks.filter(track => track.albums.includes(currentAlbumFilter)).map(track => track.path),
  {label:"+ Save selected album"}
);
albumFilterElement.insertAdjacentElement("afterend", albumPlaylistAction);

// Listen for changes on the album, song, and profile playlist tools.
window.addEventListener("princesstg:playlists-change", () => {
  customPlaylists = getPlaylists();
  renderPlaylistOptions();
  renderPlaylist();
});
window.addEventListener("storage", event => {
  if (event.key?.startsWith("princesstg-playlists-v2:")) {
    customPlaylists = getPlaylists();
    renderPlaylistOptions();
    renderPlaylist();
  }
});

playButton.addEventListener("click", playFromCurrentOrTop);
stopButton.addEventListener("click", stopPlayback);
refreshButton.addEventListener("click", () => void loadTracks());
playerElement.addEventListener("ended", goToNextTrack);
resetOrderButton.addEventListener("click", () => {
	localStorage.setItem(ORDER_STORAGE_KEY, "[]");
	void loadTracks();
});
albumFilterElement.addEventListener("change", () => {
	currentAlbumFilter = albumFilterElement.value;
	renderPlaylist();
});
sortSelectElement.addEventListener("change", () => {
	currentSort = sortSelectElement.value;
	renderPlaylist();
});
playlistSelectElement.addEventListener("change", () => {
	selectedPlaylistId = playlistSelectElement.value;
	saveSelectedPlaylist();
	renderPlaylistOptions();
	renderPlaylist();
});
createPlaylistButton.addEventListener("click", () => {
	const name = newPlaylistNameElement.value.trim();
	if (!name) {
		setStatus("Enter a playlist name first.");
		return;
	}
    let playlist;
    try {
      playlist = createNamedPlaylist(name, getPlayableTracks().map(track=>track.path));
    } catch(error) {
      setStatus(error.message);
      return;
    }
    customPlaylists = getPlaylists();
	selectedPlaylistId = playlist.id;
	newPlaylistNameElement.value = "";
	saveCustomPlaylists();
	saveSelectedPlaylist();
	renderPlaylistOptions();
	renderPlaylist();
});
deletePlaylistButton.addEventListener("click", () => {
	const playlist = getSelectedPlaylist();
	if (!playlist) return;
    deleteNamedPlaylist(playlist.id);
    customPlaylists = getPlaylists();
	selectedPlaylistId = "all";
	saveCustomPlaylists();
	saveSelectedPlaylist();
	renderPlaylistOptions();
	renderPlaylist();
});

// Account changes switch the local playlist collection for this browser.
onAuthStateChanged(auth, () => {
  customPlaylists = getPlaylists();
  renderPlaylistOptions();
  renderPlaylist();
});

void loadTracks();
