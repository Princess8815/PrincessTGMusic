// Both views live on chess.html; opening the school never navigates away.
const $=id=>document.getElementById(id);
const tabs=[$("ch-tab-play"),$("ch-tab-school")];
let active=null,schoolModule=null;
function ensureSchool(){
 if(schoolModule)return;
 schoolModule=import("./chess-academy.js").catch(error=>{
  schoolModule=null;$("academy-degrees").textContent="Chess School could not load. Reload to retry.";
  console.error("Chess School initialization failed",error);
 });
}
function select(area,{focus=false,updateHash=false}={}){
 const school=area==="school";
 $("ch-play-panel").hidden=school;$("ch-school-panel").hidden=!school;
 if(!school&&$("academy-promotion").open)$("academy-promotion").close();
 for(const tab of tabs){const yes=tab.id===(school?"ch-tab-school":"ch-tab-play");tab.setAttribute("aria-selected",String(yes));tab.tabIndex=yes?0:-1;if(yes&&focus)tab.focus();}
 if(updateHash){const url=new URL(location.href);url.hash=school?"school":"play";history.replaceState(null,"",url.href);}
 if(active!==area){active=area;window.dispatchEvent(new CustomEvent("princesstg:chess-area",{detail:{area}}));}
 if(school)ensureSchool();
}
tabs.forEach((tab,i)=>{
 tab.addEventListener("click",()=>select(i?"school":"play",{updateHash:true}));
 tab.addEventListener("keydown",event=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();const next=event.key==="Home"?0:event.key==="End"?1:1-i;select(next?"school":"play",{focus:true,updateHash:true});});
});
function readHash(){select(location.hash==="#school"?"school":"play");}
window.addEventListener("hashchange",readHash);readHash();
