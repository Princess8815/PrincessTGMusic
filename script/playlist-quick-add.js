import {addToPlaylistControl,keyForSong,getAudioIndex} from "./music-playlists.js";

// Older generated song pages already include the shared auth module.
// Add a playlist action without regenerating hundreds of HTML files.
function mount() {
  const id=document.body.dataset.songId;
  if(!id)return;
  const header=document.querySelector("main header") || document.querySelector("main .app__header");
  if(!header || document.getElementById("song-quick-playlist"))return;
  const title=document.body.dataset.songTitle || document.getElementById("songTitle")?.textContent || id;
  const box=document.createElement("div");
  box.id="song-quick-playlist";
  box.style.cssText="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:14px 0";
  const label=document.createElement("span");
  label.textContent="Save this song:";
  box.append(label,addToPlaylistControl(async()=>[
    keyForSong({title,pageId:id},await getAudioIndex().catch(()=>[]))
  ]));
  header.insertAdjacentElement("afterend",box);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});
else mount();
