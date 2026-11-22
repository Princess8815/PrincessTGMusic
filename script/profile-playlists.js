import {auth} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {loadAllSongs} from "./song-data.js";
import {wireDragReorder} from "./drag-reorder.js";
import {
  getPlaylists, createPlaylist, deletePlaylist,
  removeFromPlaylist, movePlaylistSong,
  getAudioIndex, keyForSong, songLink, audioLink
} from "./music-playlists.js";

const $=id=>document.getElementById(id);
const audio=$("profile-playlist-audio");
let selectedId="",catalog=new Map(),audioPaths=[],currentKey="",shuffling=false,shuffleRemaining=[];
const status=msg=>$("profile-playlist-status").textContent=msg;
function selected(){return getPlaylists().find(p=>p.id===selectedId)||null;}
function songEntry(key){
  return catalog.get(key)||{
    key,title:key.startsWith("song:")?key.slice(5):key.split("/").pop().replace(/\.mp3$/i,""),
    pageId:key.startsWith("song:")?key.slice(5):"",
    lyrics:"",playable:audioPaths.includes(key)
  };
}
function playable(){return (selected()?.tracks||[]).filter(key=>audioPaths.includes(key));}
function showCurrent(){
  const entry=songEntry(currentKey);
  $("profile-playlist-now-playing").textContent=currentKey?entry.title:"Choose a song";
  $("profile-playlist-lyrics-title").textContent="Lyrics"+(currentKey?" · "+entry.title:"");
  $("profile-playlist-lyrics-text").textContent=entry.lyrics?.trim()||"Lyrics aren't available for this song yet.";
  $("profile-playlist-play").textContent=audio.paused?"▶ Play":"⏸ Pause";
}
async function playKey(key){
  if(!audioPaths.includes(key)){
    status("No on-site audio for this song. Open its details instead.");
    return;
  }
  const url=audioLink(key);
  if(!url)return;
  currentKey=key;
  if(audio.src!==url){audio.src=url;audio.load();}
  try{await audio.play();status("Playing "+songEntry(key).title);}
  catch(error){status("Playback could not start. Press Play to retry.");}
  showCurrent();renderTracks();
}
function next(){
  const keys=playable();
  if(!keys.length)return status("This playlist has no playable audio.");
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
function refreshList(){
  const select=$("profile-playlist-select");
  const prev=selectedId;
  select.replaceChildren(new Option("Choose a playlist",""));
  for(const playlist of getPlaylists())select.add(new Option(playlist.name,playlist.id));
  if(getPlaylists().some(p=>p.id===prev))select.value=prev;
  else{selectedId="";select.value="";}
  $("profile-playlist-delete").disabled=!selected();
  $("profile-playlist-player-panel").hidden=!selected();
  renderTracks();
}
function renderTracks(){
  const list=$("profile-playlist-tracks");list.replaceChildren();
  const playlist=selected();
  if(!playlist)return status("Select a playlist, or create your first one.");
  status(playlist.tracks.length+" song(s) · saved on this device");
  playlist.tracks.forEach((key,index)=>{
    const entry=songEntry(key);
    const li=document.createElement("li");
    li.dataset.index=index;
    const grip=document.createElement("span");
    grip.textContent="☰";
    grip.title="Drag to reorder playlist songs";
    const title=document.createElement("div");
    title.className="playlist-track-name";title.textContent=(index+1)+". "+entry.title;
    if(key===currentKey)title.style.color="#d7b4ff";
    function button(label,handler,disabled=false){
      const btn=document.createElement("button");btn.type="button";
      btn.textContent=label;btn.disabled=disabled;btn.addEventListener("click",handler);
      return btn;
    }
    const up=button("↑",()=>movePlaylistSong(selectedId,index,index-1),index===0);
    const down=button("↓",()=>movePlaylistSong(selectedId,index,index+1),index===playlist.tracks.length-1);
    const play=button("▶",()=>void playKey(key),!audioPaths.includes(key));
    const lyrics=button("Lyrics",()=>{
      currentKey=key;showCurrent();
      $("profile-playlist-player-panel").hidden=false;
      const pane=$("profile-playlist-lyrics-text").closest("details");
      pane.open=true;
    });
    const link=document.createElement("a");link.textContent="Details";
    link.href=songLink(entry.pageId||key.replace(/^song:/,""));
    const remove=button("Remove",()=>{
      removeFromPlaylist(selectedId,key);
      if(currentKey===key){audio.pause();audio.removeAttribute("src");currentKey="";audio.load();showCurrent();}
    });
    wireDragReorder(li,grip,key,"profile-playlist:"+playlist.id,(fromKey,toKey)=>{
      const latest=getPlaylists().find(p=>p.id===playlist.id);
      if(!latest) return;
      const from=latest.tracks.indexOf(fromKey);
      const to=latest.tracks.indexOf(toKey);
      if(from<0||to<0) return;
      movePlaylistSong(playlist.id,from,to);
    });
    li.append(grip,title,up,down,play,lyrics,link,remove);list.append(li);
  });
  if(!playlist.tracks.length){
    const item=document.createElement("li");
    item.textContent="This playlist is empty. Add songs or entire albums using the + Playlist buttons.";
    list.append(item);
  }
}
async function buildCatalog(){
  try{
    const [songs,paths]=await Promise.all([
      loadAllSongs("../audioPlayer/audio/song-details.json"),
      getAudioIndex().catch(()=>[])
    ]);
    audioPaths=paths;
    catalog=new Map();
    songs.forEach(song=>{
      const key=keyForSong(song,paths);
      catalog.set(key,{...song,key,playable:paths.includes(key)});
      // Resolve legacy song IDs even when the song now has audio.
      const id=String(song.pageId||"");
      if(id)catalog.set("song:"+id,{...song,key:"song:"+id,playable:false});
    });
    refreshList();
  }catch(error){status("Unable to load music catalog: "+error.message);}
}
$("profile-playlist-select").addEventListener("change",event=>{
  selectedId=event.target.value;
  currentKey="";audio.pause();audio.removeAttribute("src");audio.load();
  shuffleRemaining=[];showCurrent();refreshList();
});
$("profile-playlist-create").addEventListener("click",()=>{
  try{
    const name=$("profile-playlist-name").value.trim();
    const playlist=createPlaylist(name);
    $("profile-playlist-name").value="";
    selectedId=playlist.id;refreshList();status("Created "+playlist.name+".");
  }catch(error){status(error.message);}
});
$("profile-playlist-delete").addEventListener("click",()=>{
  const playlist=selected();if(!playlist)return;
  if(!window.confirm("Delete playlist '"+playlist.name+"' from this browser?"))return;
  deletePlaylist(playlist.id);selectedId="";currentKey="";
  audio.pause();audio.removeAttribute("src");audio.load();refreshList();
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
  if(!user){selectedId="";audio.pause();return;}
  void buildCatalog();
});
