/* global strFormat buildElemTree */

const AUDIO_INDEX = "audio/index.json";
const ORDER_STORAGE_KEY = "audio-player-order-v1";

const playlistElement = document.getElementById("playlist");
const playerElement = document.getElementById("player");
const nowPlayingElement = document.getElementById("nowPlaying");
const statusElement = document.getElementById("status");
const playButton = document.getElementById("playBtn");
const stopButton = document.getElementById("stopBtn");
const refreshButton = document.getElementById("refreshBtn");
const resetOrderButton = document.getElementById("orderResetBtn");

let tracks = [];
let currentIndex = -1;
let isStopped = true;

/*
	Please note this function may not work correctly if there is no leading
	path or no file extension
*/
const prettifyName = (path) => {
	const slashIdx = path.lastIndexOf('/');
	const dotIdx = path.lastIndexOf('.');
	return path.substring(slashIdx + 1, dotIdx);
};

const applySavedOrder = (paths) => {
	const savedOrder = JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY) ?? "[]");
	const rank = new Map(savedOrder.map((p, index) => [p, index]));

	return [...paths].sort((a, b) => {
		const aRank = rank.has(a) ? rank.get(a) : Number.MAX_SAFE_INTEGER;
		const bRank = rank.has(b) ? rank.get(b) : Number.MAX_SAFE_INTEGER;

		if (aRank !== bRank) {
			return aRank - bRank;
		}

		return a.localeCompare(b);
	});
};

const saveOrder = ()  => {
	localStorage.setItem(
		ORDER_STORAGE_KEY,
		JSON.stringify(tracks.map((track) => track.path))
	);
};

const setStatus = (message) => {
	statusElement.textContent = message;
};

const updateActiveTrack = () => {
	[...playlistElement.querySelectorAll(".track")].forEach((row, index) => {
		row.classList.toggle("active", index === currentIndex && !isStopped);
	});
};

const loadTrack = (index, autoplay = true) => {
	if (!tracks.length || index < 0 || index >= tracks.length) {
		return;
	}

	currentIndex = index;
	const track = tracks[currentIndex];

	playerElement.src = track.path;
	nowPlayingElement.textContent = `${track.title} (${track.path})`;
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
	if (!tracks.length) {
		setStatus("No tracks available.");
		return;
	}

	isStopped = false;

	if (currentIndex < 0 || currentIndex >= tracks.length) {
		currentIndex = 0;
	}

	loadTrack(currentIndex, true);
};

const goToNextTrack = () => {
	if (!tracks.length) {
		return;
	}

	currentIndex = (currentIndex + 1) % tracks.length;
	loadTrack(currentIndex, !isStopped);
};

const reorderTracks = (fromIndex, toIndex) => {
	if (
		fromIndex === toIndex ||
		Number.isNaN(fromIndex) ||
		Number.isNaN(toIndex) ||
		fromIndex < 0 ||
		toIndex < 0
	) {
		return;
	}

	const [moved] = tracks.splice(fromIndex, 1);
	tracks.splice(toIndex, 0, moved);

	if (currentIndex === fromIndex) {
		currentIndex = toIndex;
	} else if (fromIndex < currentIndex && toIndex >= currentIndex) {
		currentIndex -= 1;
	} else if (fromIndex > currentIndex && toIndex <= currentIndex) {
		currentIndex += 1;
	}

	renderPlaylist();
	saveOrder();
};

// I'm not even sure if I like what I did here but whatever
const trackTree = [
	"li", [
		[
			"div", { className: "track", draggable: true }, [
				[
					"div", { className: "track__title" }, [
						["strong"],
						["div", { className: "track__path" }]
					]
				],
				[
					"div", { className: "track__actions" }, [
						["button", { className: "track__play", textContent: "Play" }],
						["button", { className: "track__details", textContent: "Details" }]
					]
				]
			]
		]
	]
];

const renderPlaylist = () => {
	playlistElement.innerHTML = "";

	tracks.forEach((track, index) => {
		const item = buildElemTree(trackTree);
		const row = item.querySelector(".track");
		const pathLine = item.querySelector(".track__path");
		const play = item.querySelector(".track__play");
		const details = item.querySelector(".track__details");
		const strong = item.querySelector(".track__title strong");
		row.dataset.index = String(index);
		strong.textContent = track.title;
		pathLine.textContent = track.path;
		play.addEventListener("click", () => {
			isStopped = false;
			loadTrack(index, true);
		});
		// Seems to work without encoding
		details.addEventListener("click", () => {
			//const encoded = encodeURIComponent(track.title);
			window.location.href = `pages/page-display.html?title=${track.title}`;
		});

		playlistElement.appendChild(item);

		row.addEventListener("dragstart", (event) => {
			row.classList.add("dragging");
			event.dataTransfer?.setData("text/plain", row.dataset.index ?? "");
			event.dataTransfer.effectAllowed = "move";
		});

		row.addEventListener("dragend", () => {
			row.classList.remove("dragging");
		});

		row.addEventListener("dragover", (event) => {
			event.preventDefault();
			event.dataTransfer.dropEffect = "move";
		});

		row.addEventListener("drop", (event) => {
			event.preventDefault();
			const fromIndex = Number(event.dataTransfer?.getData("text/plain"));
			const toIndex = Number(row.dataset.index);
			reorderTracks(fromIndex, toIndex);
		});
	});

	updateActiveTrack();
};

const loadTracks = async () => {
	setStatus("Loading audio index...");

	try {
		const response = await fetch(AUDIO_INDEX, { cache: "no-store" });
		if (!response.ok) {
			throw new Error(`HTTP error, status (${response.status})`);
		}
		
		const paths = await response.json();
		
		if(!paths || paths.length === 0) {
			throw new Error("No audio files found in audio/index.json");
		}
		
		const orderedPaths = applySavedOrder(paths);

		tracks = orderedPaths.map((path) => ({
			path,
			title: prettifyName(path),
		}));

		if (currentIndex >= tracks.length) {
			currentIndex = -1;
		}

		renderPlaylist();

		const suffix = tracks.length === 1 ? "" : "s";
		setStatus(`Loaded ${tracks.length} track${suffix}.`);

	} catch (error) {
		tracks = [];
		currentIndex = -1;
		renderPlaylist();
		setStatus(`Error: (${error.message})`);
		return;
	}
};

playButton.addEventListener("click", playFromCurrentOrTop);
stopButton.addEventListener("click", stopPlayback);
refreshButton.addEventListener("click", () => {
	void loadTracks();
});
playerElement.addEventListener("ended", goToNextTrack);
resetOrderButton.addEventListener("click", () => {
	localStorage.setItem(
		ORDER_STORAGE_KEY,
		"[]"
	);
	void loadTracks();
});

void loadTracks();