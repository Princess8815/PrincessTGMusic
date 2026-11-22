import {auth} from "./firebase.js";

const OLD_KEY = "audio-player-custom-playlists-v1";
const MIGRATION_FLAG = "princesstg-playlists-v2-migrated";
const KEY_PREFIX = "princesstg-playlists-v2:";
const CHANGE = "princesstg:playlists-change";
const ownKey = () => KEY_PREFIX + (auth.currentUser?.uid || "guest");
const normalize = x => String(x || "").trim();
const unique = items => [...new Set((items || []).filter(x => typeof x === "string" && x))];

function read(key, fallback) {
  try {
    const data = JSON.parse(localStorage.getItem(key) || "null");
    return data ?? fallback;
  } catch {return fallback;}
}
function persist(data) {
  localStorage.setItem(ownKey(), JSON.stringify(data));
  window.dispatchEvent(new CustomEvent(CHANGE));
}
export function getPlaylists() {
  const key = ownKey();
  if (!localStorage.getItem(key) && !localStorage.getItem(MIGRATION_FLAG)) {
    const old = read(OLD_KEY, []);
    if (Array.isArray(old) && old.length) {
      localStorage.setItem(key, JSON.stringify(old));
    }
    localStorage.setItem(MIGRATION_FLAG, "yes");
  }
  return (Array.isArray(read(key, [])) ? read(key, []) : [])
    .filter(p => p && typeof p.id === "string" && typeof p.name === "string")
    .map(p => ({id:p.id, name:p.name, tracks:unique(p.tracks)}));
}
export function savePlaylists(items) {
  if (!Array.isArray(items)) throw Error("Invalid playlist data.");
  persist(items.map(p => ({id:p.id,name:p.name,tracks:unique(p.tracks)})));
}
export function createPlaylist(name, tracks = []) {
  const cleaned = normalize(name).replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > 90) throw Error("Playlist name must be between 1 and 90 characters.");
  const next = getPlaylists();
  if (next.some(p => p.name.toLowerCase() === cleaned.toLowerCase())) throw Error("A playlist with that name already exists.");
  const id = "playlist-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,8);
  const playlist = {id,name:cleaned,tracks:unique(tracks)};
  next.push(playlist);
  savePlaylists(next);
  return playlist;
}
export function deletePlaylist(id) {
  savePlaylists(getPlaylists().filter(p => p.id !== id));
}
export function addToPlaylist(id, keys) {
  const playlists = getPlaylists();
  const playlist = playlists.find(p => p.id === id);
  if (!playlist) throw Error("Choose a playlist.");
  const before = playlist.tracks.length;
  playlist.tracks = unique([...playlist.tracks, ...unique(keys)]);
  savePlaylists(playlists);
  return playlist.tracks.length - before;
}
export function removeFromPlaylist(id, key) {
  const playlists = getPlaylists();
  const playlist = playlists.find(p => p.id === id);
  if (!playlist) throw Error("Playlist not found.");
  playlist.tracks = playlist.tracks.filter(value => value !== key);
  savePlaylists(playlists);
}
export function movePlaylistSong(id, from, to) {
  const playlists = getPlaylists();
  const playlist = playlists.find(p => p.id === id);
  if (!playlist || from < 0 || to < 0 || from >= playlist.tracks.length || to >= playlist.tracks.length) return;
  const [song] = playlist.tracks.splice(from, 1);
  playlist.tracks.splice(to, 0, song);
  savePlaylists(playlists);
}

const slug = text => normalize(text).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const stem = path => {
  let filename = normalize(path).split(/[\\/]/).pop().split(/[?#]/)[0];
  try {filename = decodeURIComponent(filename);} catch {}
  return slug(filename.replace(/\.[^.]+$/, ""));
};
let indexPromise = null;
export async function getAudioIndex() {
  if (!indexPromise) {
    const url = new URL("../audioPlayer/audio/index.json", import.meta.url);
    indexPromise = fetch(url, {cache:"no-store"}).then(async res => {
      if (!res.ok) throw Error("Audio catalog unavailable.");
      const entries = await res.json();
      if (!Array.isArray(entries)) throw Error("Audio index is invalid.");
      return entries.map(item => typeof item === "string" ? item : item?.path || item?.file || item?.src || "")
        .filter(path => typeof path === "string" && path.startsWith("audio/"));
    }).catch(err => {indexPromise = null;throw err;});
  }
  return indexPromise;
}
export function songId(song) {return normalize(song?.pageId || slug(song?.title));}
export function keyForSong(song, paths = []) {
  const wanted = stem(song?.file || song?.title || "");
  const path = paths.find(p => stem(p) === wanted);
  return path || "song:" + songId(song);
}
export function songLink(id) {
  return new URL("../audioPlayer/pages/song.html?id=" + encodeURIComponent(id), import.meta.url).href;
}
export function audioLink(path) {
  if (!path?.startsWith("audio/") || path.includes("..") || path.includes("\\"))
    return null;
  return new URL("../audioPlayer/" + path.split("/").map(encodeURIComponent).join("/"), import.meta.url).href;
}
export function orderByIds(songs, ids) {
  const ranks = new Map((Array.isArray(ids) ? ids : []).map((id,i)=>[String(id),i]));
  return [...songs].sort((a,b) => {
    const x=ranks.get(songId(a)) ?? Number.MAX_SAFE_INTEGER;
    const y=ranks.get(songId(b)) ?? Number.MAX_SAFE_INTEGER;
    return x-y || String(a.title).localeCompare(String(b.title));
  });
}

let stylesInstalled = false;
function ensureStyles() {
  if (stylesInstalled || document.querySelector('link[data-playlists-style]')) return;
  stylesInstalled = true;
  const link = document.createElement("link");
  link.rel="stylesheet";
  link.href=new URL("../styles/music-playlists.css",import.meta.url).href;
  link.dataset.playlistsStyle="1";
  document.head.append(link);
}
export function addToPlaylistControl(getKeys, options = {}) {
  ensureStyles();
  const root=document.createElement("details");
  root.className="ptg-add-playlist";
  const summary=document.createElement("summary");
  summary.textContent=options.label || "+ Playlist";
  root.append(summary);
  const inner=document.createElement("div");
  inner.className="ptg-add-playlist__content";
  const select=document.createElement("select");
  select.setAttribute("aria-label","Choose playlist");
  const add=document.createElement("button");
  add.type="button";add.textContent="Add";
  const input=document.createElement("input");
  input.type="text";input.placeholder="New playlist name";input.maxLength=90;
  input.setAttribute("aria-label","New playlist name");
  const create=document.createElement("button");create.type="button";
  create.textContent="Create & add";
  const message=document.createElement("p");message.className="ptg-playlist-message";
  message.setAttribute("role","status");
  function refresh() {
    const current=select.value;
    select.replaceChildren(new Option("Select a playlist", ""));
    for(const p of getPlaylists()) select.add(new Option(p.name,p.id));
    if([...select.options].some(o=>o.value===current)) select.value=current;
  }
  async function keys() {
    const values=await getKeys();
    const list=unique(Array.isArray(values)?values:[values]);
    if(!list.length) throw Error("No songs are available to add.");
    return list;
  }
  add.addEventListener("click",async()=>{
    add.disabled=true;
    try{const amount=addToPlaylist(select.value,await keys());message.textContent=amount+" song(s) added.";root.open=false;}
    catch(err){message.textContent=err.message;}finally{add.disabled=false;}
  });
  create.addEventListener("click",async()=>{
    create.disabled=true;
    try{
      const playlist=createPlaylist(input.value,await keys());
      input.value="";
      refresh();select.value=playlist.id;
      message.textContent="Created "+playlist.name+" with "+playlist.tracks.length+" song(s).";
      root.open=false;
    }catch(err){message.textContent=err.message;}finally{create.disabled=false;}
  });
  root.addEventListener("toggle",()=>{if(root.open)refresh();});
  window.addEventListener(CHANGE,refresh);
  inner.append(select,add,input,create,message);
  root.append(inner);
  refresh();
  return root;
}
