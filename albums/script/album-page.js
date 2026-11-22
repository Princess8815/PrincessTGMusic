import {db} from "../../script/firebase.js";
import {loadAllSongs} from "../../script/song-data.js";
import {collection,doc,getDoc,getDocs} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
const $=id=>document.getElementById(id);
const slug=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
const key=x=>String(x||"").trim().replace(/\s+/g," ").toLowerCase();
const fileKey=x=>decodeURIComponent(String(x||"").split(/[\\/]/).pop().split(/[?#]/)[0])
 .replace(/\.[^.]+$/,"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-");
async function initialize(){
 const id=new URLSearchParams(location.search).get("id");
 if(!id){$("album-status").textContent="No album selected.";return;}
 try{
  const songs=await loadAllSongs("../audioPlayer/audio/song-details.json");
  let metadata=null;
  try{
    const found=await getDoc(doc(db,"albums",id));
    if(found.exists())metadata=found.data();
  }catch(e){console.warn("Album metadata unavailable.",e);}
  let albumName=metadata?.name||"";
  if(!albumName){
    const names=new Set(songs.flatMap(song=>Array.isArray(song.albums)?song.albums:[song.album]).filter(Boolean));
    albumName=[...names].find(name=>slug(name)===id)||"";
    if(!albumName){
      try{
        const enums=await getDoc(doc(db,"enums","albums"));
        albumName=(enums.exists()?enums.data().values||[]:[]).find(x=>slug(x)===id)||"";
      }catch(e){console.warn("Legacy album list unavailable.",e);}
    }
  }
  if(!albumName){$("album-status").textContent="Album not found.";return;}
  document.title=albumName+" | PrincessTG Music";
  $("album-title").textContent=albumName;
  $("album-date").textContent="Release date: "+(metadata?.releaseDate||"TBD");
  $("album-description").textContent=metadata?.description||"";
  if(metadata?.coverUrl&&/^https:\/\//i.test(metadata.coverUrl)){
    $("album-cover").src=metadata.coverUrl;
    $("album-cover").alt=albumName+" cover";
    $("album-cover").hidden=false;
  }
  const tracks=songs.filter(song=>{
    const all=Array.isArray(song.albums)?song.albums:[song.album];
    return all.some(x=>key(x)===key(albumName));
  });
  const target=$("album-tracks");
  target.replaceChildren();
  let audioIndex=[];
  try{
    const response=await fetch("../audioPlayer/audio/index.json",{cache:"no-store"});
    if(response.ok)audioIndex=await response.json();
  }catch(e){console.warn("No on-site audio index.",e);}
  const audioMap=new Map(audioIndex.map(entry=>{
    const path=typeof entry==="string"?entry:entry?.file||entry?.path||entry?.src||"";
    return [fileKey(path),path];
  }).filter(x=>x[0]));
  tracks.sort((a,b)=>String(a.title).localeCompare(String(b.title)));
  for(const [number,song] of tracks.entries()){
    const row=document.createElement("div");row.className="track";
    const details=document.createElement("div");
    const title=document.createElement("strong");
    title.textContent=(number+1)+". "+(song.title||"Untitled");
    const sub=document.createElement("p");
    sub.textContent="Release: "+(metadata?.releaseDate||song.releaseDate||"TBD");
    sub.style.margin="2px 0";
    details.append(title,sub);
    const actions=document.createElement("div");
    const link=document.createElement("a");
    link.href="../audioPlayer/pages/song.html?id="+encodeURIComponent(song.pageId||slug(song.title));
    link.textContent="Lyrics & details";
    actions.append(link);
    const audioPath=audioMap.get(fileKey(song.file||song.title));
    if(audioPath){
      const button=document.createElement("button");
      button.type="button";button.textContent="Play";
      button.addEventListener("click",()=>{
        // Only allow playback of paths returned by the published audio index.
        const clean=audioPath.replace(/^(?:\.\.\/|\.\/|\/)+/g,"");
        $("album-player").src=new URL("../audioPlayer/"+clean,document.baseURI).href;
        $("album-player-section").hidden=false;
        $("now-playing").textContent=song.title||"Listen";
        void $("album-player").play();
      });
      actions.append(" ",button);
    }
    row.append(details,actions);target.append(row);
  }
  if(!tracks.length){
    const p=document.createElement("p");p.textContent="No songs have been assigned yet.";target.append(p);
  }
  $("album-status").textContent=tracks.length+" song(s)";
 }catch(e){
  console.error(e);$("album-status").textContent="Unable to load album. "+e.message;
 }
}
void initialize();
