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
	visibleTracks = sortTracks(tracks.filter((track) => currentAlbumFilter === "all" || track.albums.includes(currentAlbumFilter)));
};

const saveDisabledTracks = () => {
	saveJsonStorage(DISABLED_STORAGE_KEY, [...disabledTracks]);
};

const saveCustomPlaylists = () => {
	saveJsonStorage(PLAYLISTS_STORAGE_KEY, customPlaylists);
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
		? "Use each track checkbox to add or remove songs from this custom playlist."
		: "Create or choose a playlist, then use track checkboxes to customize it.";
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
	row.draggable = currentSort === "custom" && !isCustomPlaylistSelected();
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
		window.location.href = `pages/page-display.html?title=${encodeURIComponent(track.title)}`;
	});

	titleBlock.append(title, meta);
	actions.append(enabledLabel, playlistLabel, play, details);
	row.append(titleBlock, actions);
	item.append(row);

	if (row.draggable) {
		row.addEventListener("dragstart", (event) => {
			row.classList.add("dragging");
			event.dataTransfer?.setData("text/plain", row.dataset.index ?? "");
			event.dataTransfer.effectAllowed = "move";
		});
		row.addEventListener("dragend", () => row.classList.remove("dragging"));
		row.addEventListener("dragover", (event) => {
			event.preventDefault();
			event.dataTransfer.dropEffect = "move";
		});
		row.addEventListener("drop", (event) => {
			event.preventDefault();
			reorderTracks(Number(event.dataTransfer?.getData("text/plain")), Number(row.dataset.index));
		});
	}

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

const reorderTracks = (fromIndex, toIndex) => {
	if (fromIndex === toIndex || Number.isNaN(fromIndex) || Number.isNaN(toIndex) || fromIndex < 0 || toIndex < 0 || currentSort !== "custom" || isCustomPlaylistSelected()) {
		return;
	}

	const fromPath = visibleTracks[fromIndex]?.path;
	const toPath = visibleTracks[toIndex]?.path;
	const allFromIndex = tracks.findIndex((track) => track.path === fromPath);
	const allToIndex = tracks.findIndex((track) => track.path === toPath);
	if (allFromIndex < 0 || allToIndex < 0) return;

	const [moved] = tracks.splice(allFromIndex, 1);
	tracks.splice(allToIndex, 0, moved);
	saveOrder();
	renderPlaylist();
};

const loadTracks = async () => {
	setStatus("Loading audio index...");

	try {
		const [indexResponse, detailsResponse] = await Promise.all([
			fetch(AUDIO_INDEX, { cache: "no-store" }),
			fetch(SONG_DETAILS, { cache: "no-store" }),
		]);
		if (!indexResponse.ok) throw new Error(`HTTP error, status (${indexResponse.status})`);
		if (!detailsResponse.ok) throw new Error(`Song details HTTP error, status (${detailsResponse.status})`);

		const paths = await indexResponse.json();
		const details = await detailsResponse.json();
		if (!paths || paths.length === 0) throw new Error("No audio files found in audio/index.json");

		const detailsByTitle = new Map(details.map((song) => [song.title.toLowerCase(), song]));
		const detailsByPath = new Map(details.filter((song) => song.file).map((song) => [normalizeMainAudioPath(song.file), song]));

		tracks = applySavedOrder(paths.map((path) => {
			const title = prettifyName(path);
			const detail = detailsByPath.get(path) ?? detailsByTitle.get(title.toLowerCase()) ?? {};
			return {
				path,
				title: detail.title || title,
				albums: normalizeAlbums(detail.album),
				releaseDate: detail.releaseDate || "",
			};
		}));

		disabledTracks = new Set(readJsonStorage(DISABLED_STORAGE_KEY, []).filter((path) => paths.includes(path)));
		customPlaylists = readJsonStorage(PLAYLISTS_STORAGE_KEY, []).map((playlist) => ({
			...playlist,
			tracks: (playlist.tracks ?? []).filter((path) => paths.includes(path)),
		}));
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
	const playlist = { id: makePlaylistId(), name, tracks: getPlayableTracks().map((track) => track.path) };
	customPlaylists.push(playlist);
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
	customPlaylists = customPlaylists.filter((item) => item.id !== playlist.id);
	selectedPlaylistId = "all";
	saveCustomPlaylists();
	saveSelectedPlaylist();
	renderPlaylistOptions();
	renderPlaylist();
});

void loadTracks();
