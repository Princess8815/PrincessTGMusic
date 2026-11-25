import {publicError} from "./site-errors.js";
import {HOME_REEF,homeReefPortrait} from "./reef-home-art.js";
const pip=document.getElementById("home-mystery-friend");
const forbidden=document.getElementById("home-forbidden-button");
let dialog=null,attempt=0;
function createDialog(){
 const modal=document.createElement("dialog");modal.id="home-reef-dialog";modal.setAttribute("aria-labelledby","home-reef-title");
 modal.innerHTML='<div class="home-reef-art"></div><p class="home-reef-reveal"></p><h2 id="home-reef-title"></h2><p class="home-reef-status" role="status" aria-live="polite"></p><div class="home-reef-actions"><button type="button" data-home-reef-retry hidden>Retry discovery</button><button type="button" data-home-reef-close>Close</button></div>';
 modal.querySelector("[data-home-reef-close]").onclick=()=>modal.close();
 modal.addEventListener("close",()=>{attempt++;});
 document.body.append(modal);return modal;
}
async function reveal(id){
 const friend=HOME_REEF.find(f=>f[0]===id);if(!friend)return;
 const turn=++attempt;dialog ||= createDialog();
 dialog.classList.toggle("home-reef-dark",id==="hex");
 dialog.querySelector(".home-reef-art").innerHTML=homeReefPortrait(id);
 dialog.querySelector(".home-reef-reveal").textContent="You discovered "+friend[1]+"!";
 dialog.querySelector("#home-reef-title").textContent=id==="hex"?"You have freed me!":"Hello! My name is Pip!";
 const status=dialog.querySelector(".home-reef-status"),retry=dialog.querySelector("[data-home-reef-retry]");
 retry.hidden=true;retry.onclick=()=>void reveal(id);status.textContent="";
 if(!dialog.open)dialog.showModal();
 try{
  const [{discoverAxolotl},{auth}]=await Promise.all([import("./reef-collection.js"),import("./firebase.js")]);
  // The existing collection saves idempotently and retains pending guest discoveries.
  discoverAxolotl(id);
  await auth.authStateReady();
  if(turn!==attempt||!dialog.open)return;
  status.textContent=auth.currentUser?"":"Sign in to keep your discoveries.";
 }catch(error){
  if(turn!==attempt||!dialog.open)return;
  status.textContent=publicError(error,"PTG-212");retry.hidden=false;console.warn("Home reef encounter:",error);
 }
}
if(pip&&forbidden){
 pip.innerHTML=homeReefPortrait("pip",false);
 pip.addEventListener("click",()=>void reveal("pip"));
 forbidden.addEventListener("click",()=>void reveal("hex"));
 pip.hidden=false;forbidden.hidden=false;
}
