import { auth, db } from "./firebase.js";
import { verifyStaff } from "./staff-auth.js";
import { loadAllSongs } from "./song-data.js";
import {
  collection, doc, getDoc, getDocs, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

// Existing dropdowns continue to use enums/albums.
// Rich album records live at albums/{slug}; older names are supported.
const $ = id => document.getElementById(id);
const normalize = text => String(text || "").trim().replace(/\s+/g, " ");
const key = text => normalize(text).toLowerCase();
const slug = text => normalize(text).normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "album";
const dateValue = text => /^\d{4}-\d{2}-\d{2}$/.test(String(text || "")) ? text : "";
const albumRef = doc(db, "enums", "albums");
const userIsStaff = async () => {
  if (!(await verifyStaff()) || !auth.currentUser) {
    throw new Error("Administrator permissions required.");
  }
};
const show = (id, text, error = false) => {
  const el = $(id);
  el.textContent = text;
  el.style.color = error ? "#fca5a5" : "#86efac";
};

let albums = [];
let records = new Map();
async function catalog() {
  const [enums, rich] = await Promise.all([
    getDoc(albumRef), getDocs(collection(db, "albums"))
  ]);
  const names = enums.exists() ? enums.data().values : [];
  if (!Array.isArray(names)) throw new Error("enums/albums.values must be an array.");
  records = new Map();
  rich.forEach(snap => {
    const entry = snap.data();
    if (entry?.name) records.set(key(entry.name), { ...entry, id: snap.id });
  });
  albums = [...new Set([...names, ...[...records.values()].map(x => x.name)])]
    .filter(x => typeof x === "string" && normalize(x))
    .map(normalize).sort((a,b) => a.localeCompare(b));
  for (const id of ["edit-album-select", "delete-album-select"]) {
    const select = $(id), previous = select.value;
    select.replaceChildren(new Option("Choose an album...", ""));
    for (const name of albums) select.add(new Option(name, name));
    if (albums.includes(previous)) select.value = previous;
  }
}
function notifyAlbumsChanged() {
  window.dispatchEvent(new CustomEvent("princesstg:albums-updated"));
}
function existingAlbum(name) {
  return albums.find(x => key(x) === key(name));
}
// Optional short-form cover URL for artwork in the published GitHub images folder.
const IMAGE_FOLDER = "https://princess8815.github.io/PrincessTGMusic/images/";
const COVER_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];
const manualCoverUrls = { new: "", edit: "" };

function siteCoverUrl(prefix) {
  const name = normalize($(prefix + "-album-name").value);
  const extension = $(prefix + "-album-extension").value;
  if (!name || !COVER_EXTENSIONS.includes(extension)) return "";
  return IMAGE_FOLDER + slug(name) + "." + extension;
}

function refreshCoverInput(prefix) {
  const enabled = $(prefix + "-album-onsite").checked;
  const url = $(prefix + "-album-cover");
  $(prefix + "-album-extension-row").hidden = !enabled;
  url.readOnly = enabled;
  url.value = enabled ? siteCoverUrl(prefix) : manualCoverUrls[prefix];
}

function loadCoverInput(prefix, existingUrl = "") {
  const url = String(existingUrl || "");
  const match = COVER_EXTENSIONS.find(extension =>
    url === IMAGE_FOLDER + slug($(prefix + "-album-name").value) + "." + extension
  );
  $(prefix + "-album-onsite").checked = Boolean(match);
  if (match) $(prefix + "-album-extension").value = match;
  manualCoverUrls[prefix] = match ? "" : url;
  refreshCoverInput(prefix);
}

function connectCoverControls(prefix) {
  const checkbox = $(prefix + "-album-onsite");
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      manualCoverUrls[prefix] = $(prefix + "-album-cover").value.trim();
    }
    refreshCoverInput(prefix);
  });
  $(prefix + "-album-name").addEventListener("input", () => {
    if (checkbox.checked) refreshCoverInput(prefix);
  });
  $(prefix + "-album-extension").addEventListener("change", () => {
    if (checkbox.checked) refreshCoverInput(prefix);
  });
  $(prefix + "-album-cover").addEventListener("input", () => {
    if (!checkbox.checked) {
      manualCoverUrls[prefix] = $(prefix + "-album-cover").value;
    }
  });
}

function fillEdit() {
  const name = $("edit-album-select").value;
  $("edit-album-form").hidden = !name;
  if (!name) return;
  const data = records.get(key(name)) || {};
  $("edit-album-name").value = name;
  $("edit-album-date").value = dateValue(data.releaseDate);
  $("edit-album-description").value = data.description || "";
  loadCoverInput("edit", data.coverUrl || "");
}
function collect(prefix) {
  const name = normalize($(prefix + "-album-name").value);
  const releaseDate = $(prefix + "-album-date").value || "tbd";
  const description = $(prefix + "-album-description").value.trim();
  const coverUrl = $(prefix + "-album-onsite").checked
    ? siteCoverUrl(prefix)
    : $(prefix + "-album-cover").value.trim();
  if (!name || name.length > 100) throw new Error("Album name must contain 1–100 characters.");
  if (description.length > 5000) throw new Error("Description is too long.");
  if (coverUrl && !/^https:\/\//i.test(coverUrl)) throw new Error("Use an HTTPS cover URL.");
  return { name, releaseDate, description, coverUrl };
}
async function songMatches(albumName) {
  const songs = await loadAllSongs("../audioPlayer/audio/song-details.json");
  return songs.filter(song => {
    const all = Array.isArray(song.albums) ? song.albums : [song.album];
    return all.some(value => key(value) === key(albumName));
  });
}
async function applyAlbumChanges(originalName, updated, remove = false) {
  await userIsStaff();
  const current = existingAlbum(originalName);
  if (!current) throw new Error("Album no longer exists. Refresh and try again.");
  if (!remove && key(updated.name) !== key(originalName) && existingAlbum(updated.name)) {
    throw new Error("An album with that name already exists.");
  }
  if (!remove && slug(updated.name) !== slug(originalName) &&
      albums.some(name => name !== originalName && slug(name) === slug(updated.name))) {
    throw new Error("Another album already uses this page ID. Choose a different name.");
  }
  const matches = await songMatches(current);
  if (remove && matches.length) {
    throw new Error("This album has " + matches.length + " song(s). Reassign them before deleting it.");
  }
  // Keep the entire operation atomic and under Firestore's batch limit.
  if (matches.length > 380) {
    throw new Error("More than 380 songs match this album. Contact an administrator for a staged migration.");
  }
  const snap = await getDoc(albumRef);
  const names = snap.exists() ? snap.data().values : [];
  if (!Array.isArray(names)) throw new Error("Invalid album enum.");
  if (!names.some(name => key(name) === key(current))) throw new Error("Album list changed. Refresh.");
  const batch = writeBatch(db);
  batch.set(albumRef, {
    values: remove
      ? names.filter(name => key(name) !== key(current))
      : names.map(name => key(name) === key(current) ? updated.name : name)
  }, { merge: true });
  const originalRecord = records.get(key(current));
  const oldId = originalRecord?.id || slug(current);
  if (remove) {
    batch.delete(doc(db, "albums", oldId));
  } else {
    const nextId = slug(updated.name);
    if (nextId !== oldId) batch.delete(doc(db, "albums", oldId));
    batch.set(doc(db, "albums", nextId), {
      ...updated, updatedAt: serverTimestamp()
    }, { merge: true });
  }
  if (!remove) {
    // For older songs present only in song-details.json, create a valid
    // Firestore override so no manual JSON edits are necessary.
    const stored = await getDocs(collection(db, "songs"));
    const existing = new Set(stored.docs.map(d => d.id));
    const me = auth.currentUser;
    for (const song of matches) {
      const id = song.pageId || slug(song.title);
      const ref = doc(db, "songs", id);
      const changes = {
        album: updated.name,
        releaseDate: updated.releaseDate,
        updatedAt: serverTimestamp()
      };
      if (existing.has(id)) {
        batch.update(ref, changes);
      } else {
        batch.set(ref, {
          title: song.title || id,
          description: String(song.description || ""),
          genre: Array.isArray(song.genre) ? song.genre[0] : String(song.genre || (song.genres || [""])[0] || "Pop"),
          lyrics: String(song.lyrics || ""),
          translation: String(song.translation || ""),
          lyricsCollapsed: song.lyricsCollapsed !== false,
          translationCollapsed: song.translationCollapsed !== false,
          ...changes, pageId: id,
          submittedBy: { uid: me.uid, username: "PrincessTG" },
          createdAt: serverTimestamp()
        });
      }
    }
  }
  await batch.commit();
  await catalog();
  notifyAlbumsChanged();
  return matches.length;
}
document.addEventListener("DOMContentLoaded", async () => {
  connectCoverControls("new");
  connectCoverControls("edit");
  loadCoverInput("new");
  $("add-album-form").addEventListener("reset", () => {
    setTimeout(() => loadCoverInput("new"), 0);
  });
  try {
    await userIsStaff();
    await catalog();
  } catch (e) {
    show("add-album-status", "Album management unavailable: " + e.message, true);
    return;
  }
  $("add-album-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("add-album-button"); button.disabled = true;
    try {
      await userIsStaff();
      const data = collect("new");
      if (existingAlbum(data.name)) throw new Error("Album already exists.");
      if (albums.some(name => slug(name) === slug(data.name))) {
        throw new Error("Another album has the same page ID. Choose a different name.");
      }
      const snapshot = await getDoc(albumRef);
      const values = snapshot.exists() ? snapshot.data().values : [];
      if (!Array.isArray(values)) throw new Error("Invalid album list.");
      const batch = writeBatch(db);
      batch.set(albumRef, { values: [...values, data.name] }, { merge:true });
      batch.set(doc(db, "albums", slug(data.name)), { ...data, createdAt:serverTimestamp(), updatedAt:serverTimestamp() });
      await batch.commit();
      $("add-album-form").reset();
      await catalog();
      notifyAlbumsChanged();
      show("add-album-status", "Album added. Open albums/album.html?id=" + slug(data.name));
    } catch(e) { show("add-album-status", e.message, true); }
    finally { button.disabled = false; }
  });
  $("edit-album-select").addEventListener("change", fillEdit);
  $("album-refresh").addEventListener("click", async () => {
    try { await catalog(); fillEdit(); show("edit-album-status", "Album list refreshed."); }
    catch(e) { show("edit-album-status", e.message, true); }
  });
  $("edit-album-form").addEventListener("submit", async event => {
    event.preventDefault();
    const name = $("edit-album-select").value;
    if (!name) return;
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const data = collect("edit");
      const count = await applyAlbumChanges(name, data);
      $("edit-album-select").value = data.name;
      fillEdit();
      show("edit-album-status", "Album saved. Updated " + count + " associated song(s).");
    } catch(e) { show("edit-album-status", e.message, true); }
    finally { button.disabled = false; }
  });
  $("delete-album-button").addEventListener("click", async () => {
    const name = $("delete-album-select").value;
    if (!name) return show("delete-album-status", "Choose an album.", true);
    if ($("delete-album-confirm").value !== "DELETE") {
      return show("delete-album-status", "Type DELETE to confirm.", true);
    }
    const button = $("delete-album-button"); button.disabled = true;
    try {
      const removed = await applyAlbumChanges(name, null, true);
      $("delete-album-select").value = "";
      $("delete-album-confirm").value = "";
      show("delete-album-status", 'Album "' + name + '" deleted. (' + removed + " songs affected)");
    } catch(e) { show("delete-album-status", e.message, true); }
    finally { button.disabled = false; }
  });
});
