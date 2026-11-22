import {addToPlaylistControl} from "../../script/music-playlists.js";
import {wireDragReorder} from "../../script/drag-reorder.js";

const AUDIO_INDEX="audio/index.json";
const SONG_DETAILS="audio/song-details.json";
const ORDER_STORAGE_KEY="audio-player-order-v1";
const DISABLED_STORAGE_KEY="audio-player-disabled-v1";
const UNCATEGORIZED_ALBUM="Uncategorized";

const $=id=>document.getElementById(id);
const list=$("playlist"),player=$("player"),nowPlaying=$("nowPlaying"),status=$("status");
const albumFilter=$("albumFilter"),sortSelect=$("sortSelect");
let tracks=[],visibleTracks=[],currentPath="",isStopped=true;
let disabledTracks=new Set(),currentAlbumFilter="all",currentSort="custom";

function readJson(key,fallback){
  try{return JSON.parse(localStorage.getItem(key)??JSON.stringify(fallback));}
  catch{return fallback;}
}
function saveJson(key,data){localStorage.setItem(key,JSON.stringify(data));}
function slugify(title){
  return String(title||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"song";
}
function prettyName(path){
  const name=path.split("/").pop()||path;
  return name.replace(/\.[^.]+$/,"");
}
function normalizeAlbums(value){
  const parts=String(value??"").split(",").map(x=>x.trim()).filter(Boolean);
  return parts.length?parts:[UNCATEGORIZED_ALBUM];
}
const formatAlbums=albums=>albums.join(", ");
const setStatus=message=>{status.textContent=message;};
const savedOrder=()=>readJson(ORDER_STORAGE_KEY,[]);
function saveOrder(){saveJson(ORDER_STORAGE_KEY,tracks.map(track=>track.path));}
function applyOrder(items){
  const ranks=new Map(savedOrder().map((path,index)=>[path,index]));
  return [...items].sort((a,b)=>{
    const x=ranks.get(a.path)??Number.MAX_SAFE_INTEGER;
    const y=ranks.get(b.path)??Number.MAX_SAFE_INTEGER;
    return x-y||a.title.localeCompare(b.title);
  });
}
function playable(){return visibleTracks.filter(track=>!disabledTracks.has(track.path));}
function updateActiveTrack(){
  list.querySelectorAll(".track").forEach(row=>{
    row.classList.toggle("active",row.dataset.path===currentPath&&!isStopped);
  });
}
function loadTrack(path,autoplay=true){
  const track=tracks.find(item=>item.path===path);
  if(!track||disabledTracks.has(track.path))return;
  currentPath=track.path;isStopped=false;
  player.src=track.path;
  nowPlaying.textContent=track.title+" — "+formatAlbums(track.albums);
  updateActiveTrack();
  if(autoplay)void player.play().catch(()=>setStatus("Playback was blocked. Press Play to retry."));
}
function stopPlayback(){
  isStopped=true;player.pause();player.currentTime=0;
  nowPlaying.textContent="Stopped";updateActiveTrack();
}
function playCurrentOrTop(){
  const enabled=playable();
  if(!enabled.length){setStatus("No enabled tracks match the current filters.");return;}
  const choice=enabled.find(track=>track.path===currentPath)||enabled[0];
  loadTrack(choice.path,true);
}
function goNext(){
  const enabled=playable();
  if(!enabled.length){stopPlayback();return;}
  const index=enabled.findIndex(track=>track.path===currentPath);
  const nextIndex=index<0?0:(index+1)%enabled.length;
  loadTrack(enabled[nextIndex].path,!isStopped);
}
function sortTracks(items){
  if(currentSort==="custom")return items;
  return [...items].sort((a,b)=>{
    if(currentSort==="album")
      return formatAlbums(a.albums).localeCompare(formatAlbums(b.albums))||a.title.localeCompare(b.title);
    if(currentSort==="releaseDate")
      return (a.releaseDate||"9999").localeCompare(b.releaseDate||"9999")||a.title.localeCompare(b.title);
    return a.title.localeCompare(b.title);
  });
}
function updateVisible(){
  visibleTracks=sortTracks(tracks.filter(track=>
    currentAlbumFilter==="all"||track.albums.includes(currentAlbumFilter)));
}
function renderAlbumOptions(){
  const albums=[...new Set(tracks.flatMap(track=>track.albums))].sort((a,b)=>a.localeCompare(b));
  albumFilter.replaceChildren(new Option("All albums","all"));
  for(const album of albums)albumFilter.add(new Option(album,album));
  if(!albums.includes(currentAlbumFilter))currentAlbumFilter="all";
  albumFilter.value=currentAlbumFilter;
}
function reorderTracks(fromPath,toPath){
  if(!fromPath||!toPath||fromPath===toPath)return;
  const displayed=visibleTracks.map(track=>track.path);
  const from=displayed.indexOf(fromPath),to=displayed.indexOf(toPath);
  if(from<0||to<0)return;
  const reordered=[...displayed];
  const [moved]=reordered.splice(from,1);reordered.splice(to,0,moved);
  const visibleSet=new Set(displayed);
  const lookup=new Map(tracks.map(track=>[track.path,track]));
  let cursor=0;
  tracks=tracks.map(track=>visibleSet.has(track.path)?lookup.get(reordered[cursor++]):track);
  currentSort="custom";sortSelect.value="custom";
  saveOrder();renderPlaylist();
}
function createTrackRow(track,index){
  const item=document.createElement("li");
  const row=document.createElement("div");row.className="track";
  row.dataset.path=track.path;row.dataset.index=String(index);
  row.classList.toggle("track--disabled",disabledTracks.has(track.path));
  const handle=document.createElement("span");handle.textContent="☰";
  handle.title="Drag to reorder songs";
  const titleBlock=document.createElement("div");titleBlock.className="track__title";
  const title=document.createElement("strong");title.textContent=track.title;
  const metadata=document.createElement("div");metadata.className="track__path";
  metadata.textContent=formatAlbums(track.albums)+
    (track.releaseDate?" • "+track.releaseDate:"")+" • "+track.path;
  titleBlock.append(title,metadata);
  const actions=document.createElement("div");actions.className="track__actions";
  const enabled=document.createElement("label");enabled.className="track__toggle";
  const checkbox=document.createElement("input");checkbox.type="checkbox";
  checkbox.checked=!disabledTracks.has(track.path);
  checkbox.addEventListener("change",()=>{
    if(checkbox.checked)disabledTracks.delete(track.path);
    else{
      disabledTracks.add(track.path);
      if(currentPath===track.path)stopPlayback();
    }
    saveJson(DISABLED_STORAGE_KEY,[...disabledTracks]);renderPlaylist();
  });
  enabled.append(checkbox," Enabled");
  const play=document.createElement("button");play.type="button";play.textContent="Play";
  play.className="track__play";play.disabled=disabledTracks.has(track.path);
  play.addEventListener("click",()=>loadTrack(track.path,true));
  const details=document.createElement("button");details.type="button";
  details.className="track__details";details.textContent="Details";
  details.addEventListener("click",()=>{
    window.location.href="pages/song.html?id="+encodeURIComponent(track.pageId||slugify(track.title));
  });
  function arrow(symbol,delta){
    const button=document.createElement("button");button.type="button";
    button.textContent=symbol;button.title="Move "+track.title+(delta<0?" up":" down");
    button.setAttribute("aria-label",button.title);
    button.disabled=delta<0?index===0:index===visibleTracks.length-1;
    button.addEventListener("click",()=>{
      const other=visibleTracks[index+delta];
      if(other)reorderTracks(track.path,other.path);
    });
    return button;
  }
  actions.append(arrow("↑",-1),arrow("↓",1),enabled,play,details,
    addToPlaylistControl(()=>[track.path]));
  wireDragReorder(row,handle,track.path,"all-songs",reorderTracks);
  row.append(handle,titleBlock,actions);item.append(row);
  return item;
}
function renderPlaylist(){
  updateVisible();list.replaceChildren();
  visibleTracks.forEach((track,index)=>list.append(createTrackRow(track,index)));
  updateActiveTrack();
  const enabled=playable().length;
  setStatus("Showing "+visibleTracks.length+" tracks; "+enabled+" enabled for playback.");
}
async function loadTracks(){
  setStatus("Loading audio index...");
  try{
    const {loadAllSongs}=await import("../../script/song-data.js");
    const [response,details]=await Promise.all([
      fetch(AUDIO_INDEX,{cache:"no-store"}),loadAllSongs(SONG_DETAILS)
    ]);
    if(!response.ok)throw Error("Audio index error: "+response.status);
    const paths=await response.json();
    if(!Array.isArray(paths)||!paths.length)throw Error("No audio files found in audio/index.json");
    const byTitle=new Map(details.map(song=>[String(song.title).toLowerCase(),song]));
    const byPath=new Map(details.filter(song=>song.file)
      .map(song=>[String(song.file).replace(/^\.\.\//,""),song]));
    tracks=applyOrder(paths.map(path=>{
      const fallback=prettyName(path);
      const detail=byPath.get(path)||byTitle.get(fallback.toLowerCase())||{};
      return {
        path,title:detail.title||fallback,
        pageId:detail.pageId||slugify(detail.title||fallback),
        albums:normalizeAlbums(detail.album),
        releaseDate:detail.releaseDate||""
      };
    }));
    disabledTracks=new Set(readJson(DISABLED_STORAGE_KEY,[]).filter(path=>paths.includes(path)));
    renderAlbumOptions();renderPlaylist();
  }catch(error){
    tracks=[];visibleTracks=[];renderPlaylist();
    setStatus("Error: "+error.message);
  }
}
// Save a filtered full album into an existing or new profile playlist.
const albumAction=addToPlaylistControl(
  ()=>currentAlbumFilter==="all"?[]:
    tracks.filter(track=>track.albums.includes(currentAlbumFilter)).map(track=>track.path),
  {label:"+ Save selected album"}
);
albumFilter.insertAdjacentElement("afterend",albumAction);

$("playBtn").addEventListener("click",playCurrentOrTop);
$("stopBtn").addEventListener("click",stopPlayback);
$("refreshBtn").addEventListener("click",()=>void loadTracks());
$("orderResetBtn").addEventListener("click",()=>{
  localStorage.setItem(ORDER_STORAGE_KEY,"[]");void loadTracks();
});
player.addEventListener("ended",goNext);
albumFilter.addEventListener("change",()=>{currentAlbumFilter=albumFilter.value;renderPlaylist();});
sortSelect.addEventListener("change",()=>{currentSort=sortSelect.value;renderPlaylist();});
void loadTracks();
