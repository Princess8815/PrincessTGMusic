import {db} from "../../script/firebase.js";
import {loadAllSongs} from "../../script/song-data.js";
import {wireDragReorder} from "../../script/drag-reorder.js";
import {
  getAudioIndex, keyForSong, songId, songLink, audioLink,
  orderByIds, addToPlaylistControl
} from "../../script/music-playlists.js";
import {doc,getDoc} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const $=id=>document.getElementById(id);
const albumId=new URLSearchParams(location.search).get("id");
const normalize=x=>String(x||"").trim().replace(/\s+/g," ").toLowerCase();
const slug=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
const personalKey="princesstg-album-track-order:"+albumId;
const audio=$("album-player");
let tracks=[],official=[],currentId="",shuffling=false,repeating=false,shuffleBag=[],shuffleCycleStarted=false,history=[];
let albumName="";
function setMessage(text){$("album-playback-status").textContent=text;}
function playable(){return tracks.filter(track=>track.audioKey.startsWith("audio/"));}
function isPlaying(){return !audio.paused && !audio.ended;}
function refreshNowPlaying(song){
  $("now-playing-title").textContent=song?.title||"Choose a song";
  $("now-playing-album").textContent=song?albumName:"";
  $("album-lyrics-title").textContent=song?.title?"Lyrics · "+song.title:"Lyrics (expand)";
  $("album-lyrics-text").textContent=song?.lyrics?.trim()||"Lyrics aren't available for this song yet.";
  $("album-toggle-play").textContent=isPlaying()?"⏸ Pause":"▶ Play";
}
async function playTrack(track,auto=true,remember=true){
  if(!track || !track.audioKey.startsWith("audio/")){
    setMessage("This song has no on-site audio. Its lyrics and details are still available.");
    refreshNowPlaying(track);
    return;
  }
  const link=audioLink(track.audioKey);
  if(!link) return;
  if(remember && currentId && currentId!==track.id) history.push(currentId);
  currentId=track.id;
  if(audio.src!==link) audio.src=link;
  audio.load();
  refreshNowPlaying(track);
  renderTracks();
  if(auto) {
    try {await audio.play();setMessage("Playing "+track.title);}
    catch(error){setMessage("Unable to play this song. Choose Play to try again.");}
  }
  refreshNowPlaying(track);
}
function getNextTrack(auto=false){
  const available=playable();
  if(!available.length) return null;
  if(shuffling){
    const choices=available.filter(track=>track.id!==currentId);
    if(!shuffleBag.length){
      if(auto&&shuffleCycleStarted&&!repeating)return null;
      shuffleBag=choices.map(x=>x.id);
      shuffleCycleStarted=true;
      for(let i=shuffleBag.length-1;i>0;i--){
        const j=Math.floor(Math.random()*(i+1));
        [shuffleBag[i],shuffleBag[j]]=[shuffleBag[j],shuffleBag[i]];
      }
    }
    if(!choices.length) return repeating||!auto?available[0]:null;
    const next=shuffleBag.shift();
    return available.find(track=>track.id===next)||choices[0];
  }
  const index=available.findIndex(track=>track.id===currentId);
  if(index<0)return available[0];
  if(index===available.length-1)return auto&&!repeating?null:available[0];
  return available[index+1];
}
function next(auto=false){
  const track=getNextTrack(auto);
  if(track)void playTrack(track);
  else {audio.pause();setMessage(auto?"Album finished.":"No playable songs.");refreshNowPlaying(tracks.find(t=>t.id===currentId));}
}
function previous(){
  const available=playable();
  if(!available.length)return;
  if(shuffling&&history.length){
    const previous=available.find(track=>track.id===history.pop());
    if(previous){void playTrack(previous,true,false);return;}
  }
  const index=available.findIndex(track=>track.id===currentId);
  void playTrack(available[(index-1+available.length)%available.length],true,false);
}
function savedOrder(){
  try{
    const ids=JSON.parse(localStorage.getItem(personalKey));
    return Array.isArray(ids)?ids.filter(id=>typeof id==="string"):null;
  }catch{return null;}
}
function saveOrder(){localStorage.setItem(personalKey,JSON.stringify(tracks.map(track=>track.id)));}
function move(from,to){
  if(from<0||to<0||from>=tracks.length||to>=tracks.length||from===to)return;
  const [track]=tracks.splice(from,1);
  tracks.splice(to,0,track);
  shuffleBag=[];
  shuffleCycleStarted=false;
  saveOrder();
  $("album-status").textContent=tracks.length+" song(s) · Your personal order";
  renderTracks();
}
function newButton(label,click,title,disabled=false){
  const button=document.createElement("button");
  button.type="button";button.textContent=label;button.title=title||label;
  button.setAttribute("aria-label",title||label);
  button.disabled=disabled;button.addEventListener("click",click);
  return button;
}
function renderTracks(){
  const target=$("album-tracks");target.replaceChildren();
  tracks.forEach((song,index)=>{
    const row=document.createElement("li");row.className="album-track";
    row.classList.toggle("is-playing",currentId===song.id);
    const grip=document.createElement("span");grip.className="drag-grip";
    grip.textContent="☰";grip.title="Drag to reorder";
    const info=document.createElement("div");info.className="album-track-info";
    const name=document.createElement("strong");name.textContent=(index+1)+". "+song.title;
    const note=document.createElement("small");
    note.textContent=song.audioKey.startsWith("audio/")?"Ready to play":"Lyrics and details only";
    info.append(name,note);
    const actions=document.createElement("div");actions.className="album-track-actions";
    const up=newButton("↑",()=>move(index,index-1),"Move "+song.title+" up",index===0);
    const down=newButton("↓",()=>move(index,index+1),"Move "+song.title+" down",index===tracks.length-1);
    const play=newButton("▶",()=>void playTrack(song),"Play "+song.title,!song.audioKey.startsWith("audio/"));
    const lyrics=newButton("Lyrics",()=>{
      refreshNowPlaying(song);
      $("album-lyrics-panel").open=true;
      $("album-lyrics-panel").scrollIntoView({behavior:"smooth",block:"nearest"});
    },"Read lyrics for "+song.title);
    const details=document.createElement("a");details.href=songLink(song.id);
    details.textContent="Details";
    actions.append(up,down,play,lyrics,details,addToPlaylistControl(()=>[song.audioKey]));
    row.append(grip,info,actions);
    wireDragReorder(row,grip,song.id,"album:"+albumId,(sourceId,targetId)=>{
      const from=tracks.findIndex(track=>track.id===sourceId);
      const to=tracks.findIndex(track=>track.id===targetId);
      move(from,to);
    });
    target.append(row);
  });
  if(!tracks.length){
    const empty=document.createElement("li");
    empty.textContent="No songs have been assigned yet.";
    target.append(empty);
  }
}
function registerControls(){
  $("album-prev").onclick=previous;
  $("album-next").onclick=()=>next(false);
  $("album-toggle-play").onclick=()=>{
    if(isPlaying())audio.pause();
    else if(audio.src)void audio.play();
    else void playTrack(getNextTrack());
  };
  $("album-shuffle").onclick=()=>{
    shuffling=!shuffling;shuffleBag=[];shuffleCycleStarted=false;
    $("album-shuffle").setAttribute("aria-pressed",String(shuffling));
    setMessage(shuffling?"Shuffle is on.":"Shuffle is off.");
  };
  $("album-repeat").onclick=()=>{
    repeating=!repeating;
    $("album-repeat").setAttribute("aria-pressed",String(repeating));
    setMessage(repeating?"Repeat album is on.":"Repeat album is off.");
  };
  $("album-reset-order").onclick=()=>{
    localStorage.removeItem(personalKey);
    tracks=[...official];
    shuffleBag=[];
    shuffleCycleStarted=false;
    $("album-status").textContent=tracks.length+" song(s) · Official order";
    renderTracks();
    setMessage("Restored the official album track order.");
  };
  audio.addEventListener("ended",()=>next(true));
  audio.addEventListener("play",()=>refreshNowPlaying(tracks.find(track=>track.id===currentId)));
  audio.addEventListener("pause",()=>refreshNowPlaying(tracks.find(track=>track.id===currentId)));
}
async function load(){
  registerControls();
  if(!albumId){$("album-status").textContent="No album selected.";return;}
  try{
    const [songs,paths]=await Promise.all([
      loadAllSongs("../audioPlayer/audio/song-details.json"),
      getAudioIndex().catch(()=>[])
    ]);
    let metadata=null;
    try{
      const snapshot=await getDoc(doc(db,"albums",albumId));
      if(snapshot.exists())metadata=snapshot.data();
    }catch(error){console.warn("Album metadata unavailable",error);}
    albumName=metadata?.name||"";
    if(!albumName){
      const names=new Set(songs.flatMap(song=>Array.isArray(song.albums)?song.albums:[song.album]).filter(Boolean));
      albumName=[...names].find(name=>slug(name)===albumId)||"";
      if(!albumName){
        try{
          const enums=await getDoc(doc(db,"enums","albums"));
          albumName=(enums.exists()?enums.data().values||[]:[]).find(name=>slug(name)===albumId)||"";
        }catch(error){console.warn("Legacy album names unavailable",error);}
      }
    }
    if(!albumName){$("album-status").textContent="Album not found.";return;}
    document.title=albumName+" | PrincessTG Music";
    $("album-title").textContent=albumName;
    $("album-date").textContent="Release date · "+(metadata?.releaseDate||"TBD");
    $("album-description").textContent=metadata?.description||"";
    if(metadata?.coverUrl&&/^https:\/\//i.test(metadata.coverUrl)){
      $("album-cover").src=metadata.coverUrl;
      $("album-cover").alt=albumName+" artwork";
      $("album-cover").hidden=false;
      $("album-cover-fallback").hidden=true;
      $("album-cover").addEventListener("error",()=>{
        $("album-cover").hidden=true;$("album-cover-fallback").hidden=false;
      },{once:true});
    }
    const owned=songs.filter(song=>{
      const list=Array.isArray(song.albums)?song.albums:[song.album];
      return list.some(name=>normalize(name)===normalize(albumName));
    });
    owned.sort((a,b)=>String(a.title).localeCompare(String(b.title)));
    official=orderByIds(owned,metadata?.trackOrder||[]).map(song=>({
      ...song,id:songId(song),audioKey:keyForSong(song,paths)
    }));
    const custom=savedOrder();
    tracks=custom?orderByIds(official,custom):[...official];
    $("album-playlist-actions").append(
      addToPlaylistControl(()=>tracks.map(song=>song.audioKey),{label:"+ Add entire album to playlist"})
    );
    renderTracks();
    $("album-status").textContent=tracks.length+" song(s) · "+(custom?"Your personal order":"Official order");
    refreshNowPlaying(null);
    if(!playable().length)setMessage("No on-site audio is available yet. Lyrics and track details are still accessible.");
  }catch(error){
    console.error("Unable to load album",error);
    $("album-status").textContent="Unable to load album: "+error.message;
  }
}
void load();
