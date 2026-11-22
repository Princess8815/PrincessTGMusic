import {auth} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {loadAllSongs} from "./song-data.js";
import {wireDragReorder} from "./drag-reorder.js";
import {
  getPlaylists, createPlaylist, deletePlaylist, setPlaylistColor,
  removeFromPlaylist, movePlaylistSong, getAudioIndex,
  keyForSong, songLink, audioLink
} from "./music-playlists.js";

const $=id=>document.getElementById(id);
const audio=$("profile-playlist-audio");
let selectedId="",catalog=new Map(),audioPaths=[],currentKey="",shuffling=false,shuffleRemaining=[];
let searchTerm="",sortMode="recent",colorFilter="all";
const status=message=>{$("profile-playlist-status").textContent=message;};
const storageKey=()=> "princesstg-profile-playlist-selected-v1:"+(auth.currentUser?.uid||"guest");
function selected(){return getPlaylists().find(p=>p.id===selectedId)||null;}
function songEntry(key){
  return catalog.get(key)||{
    key,title:key.startsWith("song:")?key.slice(5):key.split("/").pop().replace(/\.mp3$/i,""),
    pageId:key.startsWith("song:")?key.slice(5):"",
    lyrics:"",playable:audioPaths.includes(key)
  };
}
function playable(){return (selected()?.tracks||[]).filter(key=>audioPaths.includes(key));}
function showLyrics(key){
  const entry=songEntry(key||"");
  $("profile-playlist-lyrics-title").textContent="Lyrics"+(key?" · "+entry.title:"");
  $("profile-playlist-lyrics-text").textContent=key
    ? (entry.lyrics?.trim()||"Lyrics aren't available for this song yet.")
    : "Choose a track to view lyrics.";
}
function showCurrent(){
  $("profile-playlist-now-playing").textContent=currentKey?songEntry(currentKey).title:"Choose a song";
  showLyrics(currentKey);
  $("profile-playlist-play").textContent=audio.paused?"▶ Play":"⏸ Pause";
}
function stopAudio(){
  audio.pause();audio.removeAttribute("src");audio.load();
  currentKey="";shuffleRemaining=[];showCurrent();
}
async function playKey(key){
  if(!audioPaths.includes(key)){status("No on-site audio for this song. Open its details instead.");return;}
  const url=audioLink(key);
  if(!url)return;
  currentKey=key;
  if(audio.src!==url){audio.src=url;audio.load();}
  try{await audio.play();status("Playing "+songEntry(key).title);}
  catch{status("Playback could not start. Press Play to retry.");}
  showCurrent();renderTracks();
}
function next(){
  const keys=playable();
  if(!keys.length){status("This playlist has no playable audio.");return;}
  let key;
  if(shuffling&&keys.length>1){
    if(!shuffleRemaining.length)shuffleRemaining=keys.filter(k=>k!==currentKey).sort(()=>Math.random()-.5);
    key=shuffleRemaining.shift();
  }else{
    const i=keys.indexOf(currentKey);
    key=keys[(i+1)%keys.length];
  }
  void playKey(key||keys[0]);
}
function previous(){
  const keys=playable();
  if(!keys.length)return;
  const i=keys.indexOf(currentKey);
  void playKey(keys[(i-1+keys.length)%keys.length]);
}
function selectPlaylist(id){
  if(selectedId===id)return;
  selectedId=id;localStorage.setItem(storageKey(),id);
  stopAudio();refreshList();
}
function sortedPlaylists(items){
  const result=items.filter(p=>
    p.name.toLowerCase().includes(searchTerm) &&
    (colorFilter==="all"||p.color===colorFilter));
  if(sortMode==="name")result.sort((a,b)=>a.name.localeCompare(b.name));
  else if(sortMode==="name-desc")result.sort((a,b)=>b.name.localeCompare(a.name));
  else if(sortMode==="tracks")result.sort((a,b)=>b.tracks.length-a.tracks.length||a.name.localeCompare(b.name));
  else if(sortMode==="tracks-asc")result.sort((a,b)=>a.tracks.length-b.tracks.length||a.name.localeCompare(b.name));
  else if(sortMode==="color")result.sort((a,b)=>a.color.localeCompare(b.color)||a.name.localeCompare(b.name));
  else result.sort((a,b)=>b.updatedAt-a.updatedAt||a.name.localeCompare(b.name));
  return result;
}
function refreshList(){
  const playlists=getPlaylists();
  if(!playlists.some(p=>p.id===selectedId)){
    selectedId=playlists[0]?.id||"";
    if(selectedId)localStorage.setItem(storageKey(),selectedId);
    else localStorage.removeItem(storageKey());
  }
  $("profile-playlist-count").textContent="("+playlists.length+")";
  const colors=[...new Set(playlists.map(p=>p.color))].sort();
  const colorSelect=$("profile-playlist-color-filter");
  const keep=colorFilter;
  colorSelect.replaceChildren(new Option("All colors","all"));
  for(const color of colors)colorSelect.add(new Option(color.toUpperCase(),color));
  colorFilter=colors.includes(keep)?keep:"all";colorSelect.value=colorFilter;

  const visible=sortedPlaylists(playlists);
  const list=$("profile-playlist-library");list.replaceChildren();
  for(const playlist of visible){
    const li=document.createElement("li");
    const button=document.createElement("button");
    button.type="button";
    button.setAttribute("aria-current",String(playlist.id===selectedId));
    button.style.setProperty("--playlist-color",playlist.color);
    button.setAttribute("aria-label",playlist.name+" · "+playlist.tracks.length+" songs");
    const swatch=document.createElement("span");swatch.className="playlist-library-swatch";
    swatch.setAttribute("aria-hidden","true");
    const body=document.createElement("span");body.className="playlist-library-name";
    const name=document.createElement("strong");name.textContent=playlist.name;
    const count=document.createElement("small");count.textContent=playlist.tracks.length+" song"+(playlist.tracks.length===1?"":"s");
    body.append(name,count);button.append(swatch,body);
    button.addEventListener("click",()=>selectPlaylist(playlist.id));
    li.append(button);list.append(li);
  }
  const empty=$("profile-playlist-library-empty");
  empty.hidden=visible.length>0;
  empty.textContent=playlists.length
    ? "No playlists match your search or color filter."
    : "No playlists yet. Create one below.";

  const playlist=selected();
  $("profile-playlist-empty-state").hidden=!!playlist;
  $("profile-playlist-selected-panel").hidden=!playlist;
  if(playlist){
    $("profile-playlist-selected-title").textContent=playlist.name;
    $("profile-playlist-selected-meta").textContent=playlist.tracks.length+" song"+(playlist.tracks.length===1?"":"s")+" · saved on this device";
    $("profile-playlist-color").value=playlist.color;
    $("profile-playlist-selected-swatch").style.setProperty("--playlist-color",playlist.color);
    $("profile-playlist-delete").disabled=false;
  }
  renderTracks();
}
function renderTracks(){
  const list=$("profile-playlist-tracks");list.replaceChildren();
  const playlist=selected();
  if(!playlist)return;
  playlist.tracks.forEach((key,index)=>{
    const entry=songEntry(key);
    const li=document.createElement("li");li.dataset.index=String(index);
    const grip=document.createElement("span");grip.textContent="☰";
    grip.title="Drag to reorder playlist songs";
    const title=document.createElement("div");
    title.className="playlist-track-name";title.textContent=(index+1)+". "+entry.title;
    if(key===currentKey)title.style.color="#d7b4ff";
    function button(label,handler,disabled=false){
      const b=document.createElement("button");b.type="button";
      b.textContent=label;b.disabled=disabled;b.addEventListener("click",handler);return b;
    }
    const up=button("↑",()=>movePlaylistSong(playlist.id,index,index-1),index===0);
    const down=button("↓",()=>movePlaylistSong(playlist.id,index,index+1),index===playlist.tracks.length-1);
    const play=button("▶ Play",()=>void playKey(key),!audioPaths.includes(key));
    const lyrics=button("Lyrics",()=>{
      showLyrics(key);
      $("profile-playlist-lyrics-text").closest("details").open=true;
    });
    const link=document.createElement("a");link.textContent="Details";
    link.href=songLink(entry.pageId||key.replace(/^song:/,""));
    const remove=button("Remove",()=>{
      removeFromPlaylist(playlist.id,key);
      if(currentKey===key)stopAudio();
    });
    wireDragReorder(li,grip,key,"profile-playlist:"+playlist.id,(fromKey,toKey)=>{
      const latest=getPlaylists().find(p=>p.id===playlist.id);
      if(!latest)return;
      const from=latest.tracks.indexOf(fromKey);
      const to=latest.tracks.indexOf(toKey);
      if(from>=0&&to>=0)movePlaylistSong(playlist.id,from,to);
    });
    li.append(grip,title,up,down,play,lyrics,link,remove);list.append(li);
  });
  if(!playlist.tracks.length){
    const item=document.createElement("li");
    item.textContent="Empty playlist. Use + Playlist on a song or album to add music here.";
    list.append(item);
  }
}
async function buildCatalog(){
  const [songResult,indexResult]=await Promise.allSettled([
    loadAllSongs("../audioPlayer/audio/song-details.json"),getAudioIndex()
  ]);
  const songs=songResult.status==="fulfilled"?songResult.value:[];
  audioPaths=indexResult.status==="fulfilled"?indexResult.value:[];
  catalog=new Map();
  songs.forEach(song=>{
    const key=keyForSong(song,audioPaths);
    catalog.set(key,{...song,key,playable:audioPaths.includes(key)});
    const id=String(song.pageId||"");
    if(id)catalog.set("song:"+id,{...song,key:"song:"+id,playable:false});
  });
  refreshList();
  if(songResult.status!=="fulfilled"||indexResult.status!=="fulfilled"){
    status("Some song information is unavailable. Your saved playlists are still here.");
  }
}
$("profile-playlist-create-form").addEventListener("submit",event=>{
  event.preventDefault();
  try{
    const playlist=createPlaylist($("profile-playlist-name").value.trim(),[],
      $("profile-playlist-create-color").value);
    $("profile-playlist-name").value="";
    selectPlaylist(playlist.id);refreshList();
    status("Created "+playlist.name+".");
  }catch(error){status(error.message);}
});
$("profile-playlist-send").addEventListener("click",()=>{
  const playlist=selected();
  if(!playlist)return;
  if(!playlist.tracks.length){status("Add some songs before sending this playlist.");return;}
  if(playlist.tracks.length>150){status("Mail can share playlists with up to 150 songs.");return;}
  window.dispatchEvent(new CustomEvent("princesstg:mail-share",{
    detail:{kind:"playlist",name:playlist.name,color:playlist.color,tracks:[...playlist.tracks]}
  }));
});
$("profile-playlist-delete").addEventListener("click",()=>{
  const playlist=selected();if(!playlist)return;
  if(!window.confirm("Delete playlist '"+playlist.name+"' from this browser?"))return;
  deletePlaylist(playlist.id);stopAudio();selectedId="";
  refreshList();status("Playlist deleted.");
});
$("profile-playlist-color").addEventListener("input",event=>{
  const playlist=selected();if(!playlist)return;
  try{setPlaylistColor(playlist.id,event.target.value);}catch(error){status(error.message);}
});
$("profile-playlist-search").addEventListener("input",event=>{
  searchTerm=event.target.value.trim().toLowerCase();refreshList();
});
$("profile-playlist-sort").addEventListener("change",event=>{
  sortMode=event.target.value;refreshList();
});
$("profile-playlist-color-filter").addEventListener("change",event=>{
  colorFilter=event.target.value;refreshList();
});
$("profile-playlist-prev").addEventListener("click",previous);
$("profile-playlist-next").addEventListener("click",next);
$("profile-playlist-play").addEventListener("click",()=>{
  if(!audio.paused)audio.pause();
  else if(audio.src)void audio.play();
  else if(playable().length)void playKey(playable()[0]);
});
$("profile-playlist-shuffle").addEventListener("click",()=>{
  shuffling=!shuffling;shuffleRemaining=[];
  $("profile-playlist-shuffle").setAttribute("aria-pressed",String(shuffling));
  status(shuffling?"Shuffle enabled.":"Shuffle disabled.");
});
audio.addEventListener("ended",next);
audio.addEventListener("play",showCurrent);
audio.addEventListener("pause",showCurrent);
window.addEventListener("princesstg:playlists-change",refreshList);
window.addEventListener("storage",event=>{
  if(event.key?.startsWith("princesstg-playlists-v2:"))refreshList();
});
onAuthStateChanged(auth,user=>{
  stopAudio();
  selectedId=user?(localStorage.getItem(storageKey())||""):"";
  catalog=new Map();audioPaths=[];
  refreshList();
  if(user)void buildCatalog();
});
