import {watchStaffRole} from "./staff-auth.js";

// UI-only download permissions. Published GitHub Pages MP3 URLs remain
// publicly accessible by design; true file protection needs private storage.
let staffAllowed=false;
function audioUrl(audio){
  const source=audio.currentSrc||audio.getAttribute("src")||audio.querySelector("source[src]")?.src;
  return source||"";
}
function syncAudio(){
  for(const audio of document.querySelectorAll("audio")){
    // Suppresses the built-in Chrome/Edge download menu for every visitor.
    audio.controlsList?.add("nodownload");
    audio.setAttribute("controlsList","nodownload");
    let link=audio.nextElementSibling;
    if(!link?.classList?.contains("princesstg-admin-audio-download")){
      link=document.createElement("a");
      link.className="princesstg-admin-audio-download";
      link.style.cssText="display:inline-block;margin:8px 0;color:#c4b5fd;font-weight:bold";
      link.textContent="Download audio (admin)";
      audio.insertAdjacentElement("afterend",link);
    }
    const url=audioUrl(audio);
    link.hidden=!staffAllowed||!url;
    if(staffAllowed&&url){
      link.href=url;
      link.download=decodeURIComponent(new URL(url,document.baseURI).pathname.split("/").pop());
    }else{
      link.removeAttribute("href");
      link.removeAttribute("download");
    }
  }
}
function start(){
  syncAudio();
  const observer=new MutationObserver(syncAudio);
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["src"]});
  watchStaffRole(allowed=>{
    staffAllowed=allowed===true;
    syncAudio();
  });
}
if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",start,{once:true});
}else start();
