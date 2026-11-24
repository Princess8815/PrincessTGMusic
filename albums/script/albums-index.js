import {songAlbums} from "../../script/song-albums.js";
import {db} from "../../script/firebase.js";
import {loadAllSongs} from "../../script/song-data.js";
import {collection,doc,getDoc,getDocs} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {addToPlaylistControl,keyForSong,getAudioIndex} from "../../script/music-playlists.js";
const grid=document.getElementById("album-grid");
const search=document.getElementById("search");
const status=document.getElementById("status");
const empty=document.getElementById("empty");
const reload=document.getElementById("reload");
const key=x=>String(x||"").trim().replace(/\s+/g," ").toLowerCase();
const slug=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"album";
let cards=[];
function display(){
  const filter=key(search.value);
  let visible=0,count=0;
  for(const item of cards){
    item.element.hidden=!key(item.name).includes(filter);
    if(!item.element.hidden){visible++;count+=item.count;}
  }
  empty.hidden=visible>0;
  empty.textContent=filter?"No matching albums.":"No albums yet.";
  status.textContent=visible+" album(s) · "+count+" song(s)";
}
function makeCard(album){
  const article=document.createElement("article");
  article.className="album-card";
  if(album.coverUrl && /^https:\/\//i.test(album.coverUrl)){
    const img=document.createElement("img");
    img.src=album.coverUrl;img.alt=album.name+" cover";img.loading="lazy";
    img.style.cssText="max-width:100%;height:170px;object-fit:contain;border-radius:8px";
    article.append(img);
  }
  const h2=document.createElement("h2");h2.textContent=album.name;
  const count=document.createElement("p");count.className="song-count";
  count.textContent=album.count+" song(s)";
  const date=document.createElement("p");date.className="page-status";
  date.textContent="Release: "+(album.releaseDate||"TBD");
  const link=document.createElement("a");link.className="open-album";
  link.href="./album.html?id="+encodeURIComponent(album.id||slug(album.name));
  link.textContent="Open album";link.setAttribute("aria-label","Open "+album.name);
  const addAll=addToPlaylistControl(async()=> {
    const paths=await getAudioIndex().catch(()=>[]);
    return (album.songs||[]).map(song=>keyForSong(song,paths));
  },{label:"+ Add full album"});
  article.append(h2,count,date,link,addAll);grid.append(article);
  return {name:album.name,count:album.count,element:article};
}
async function loadAlbums(){
  reload.disabled=true;search.disabled=true;status.textContent="Loading albums…";
  grid.replaceChildren();cards=[];empty.hidden=true;
  try{
    const songs=await loadAllSongs("../audioPlayer/audio/song-details.json");
    const albums=new Map();
    for(const song of songs){
      const names=songAlbums(song);
      for(const name of names){
        if(typeof name!=="string"||!name.trim())continue;
        const id=key(name);
        if(!albums.has(id))albums.set(id,{name:name.trim(),count:0,songs:[]});
        albums.get(id).count++;
        albums.get(id).songs.push(song);
      }
    }
    try{
      const [enums,rich]=await Promise.all([
        getDoc(doc(db,"enums","albums")),getDocs(collection(db,"albums"))
      ]);
      for(const name of enums.exists()&&Array.isArray(enums.data().values)?enums.data().values:[]){
        if(name&&!albums.has(key(name)))albums.set(key(name),{name,count:0,songs:[]});
      }
      rich.forEach(item=>{
        const record=item.data(),name=record.name;
        if(!name)return;
        const existing=albums.get(key(name))||{name,count:0,songs:[]};
        albums.set(key(name),{...existing,...record,id:item.id});
      });
    }catch(e){console.warn("Album metadata unavailable; using song catalog.",e);}
    cards=[...albums.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(makeCard);
    search.disabled=false;display();
  }catch(e){
    console.error(e);status.textContent="Album catalog unavailable.";
    empty.hidden=false;empty.textContent="Try Refresh.";
  }finally{reload.disabled=false;}
}
search.addEventListener("input",display);
reload.addEventListener("click",loadAlbums);
void loadAlbums();
