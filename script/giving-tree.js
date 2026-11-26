
import {auth,usingLocalFirebaseEmulators} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {PLOTS,INVENTORY_STEP,INVENTORY_MAX,inventoryCapacity,inventoryUpgradeCost,WATER_MS,FERT_MS,FERT_COST,FRUIT_WORK,growthWork,stage,stageNames,damage,dropCoins,advanceGarden,sortedPears} from "./giving-tree-core.mjs";
import {showToast} from "./toast-sound.js";
const $=id=>document.getElementById(id),area=$("gt-area"),endpoint="https://princesstg-cd-store-live.transgirl1991.workers.dev/games/giving-tree";
const eligible=()=>!!auth.currentUser?.emailVerified&&!usingLocalFirebaseEmulators,fmt=n=>Number(n).toLocaleString(undefined,{maximumFractionDigits:2}),time=ms=>{let s=Math.max(0,Math.ceil(ms/1000));return s>=3600?Math.floor(s/3600)+"h "+Math.floor(s/60)%60+"m":s>=60?Math.floor(s/60)+"m "+s%60+"s":s+"s";};
let saved=null,wallet=0,selected=new Set(),offset=0,busy=false,failed=null,epoch=0,lastSync=0,seen=new Set(),expanded=false,oldOverflow="",inventorySignature="";
const plots=[],opponents={};
let armed=null,sortMode="newest",visibleInventory=[];
const selectedIds=()=>[...selected].sort((a,b)=>a-b);
const singleId=()=>selected.size===1?selected.values().next().value:null;
const allIds=()=>visibleInventory.map(p=>p.id).sort((a,b)=>a-b);
const selectionKey=ids=>ids.join(",");
function isArmed(kind,id){return armed?.kind===kind&&armed.id===id&&Date.now()<armed.until;}
function confirmAction(kind,id,extras){
 if(busy||failed||!saved||!eligible())return;
 if(isArmed(kind,id)){armed=null;void send(kind,extras);return;}
 armed={kind,id,until:Date.now()+8000};render();
}
function confirmationButton(b,active,label){
 b.textContent=active?"Are you sure?":label;
 b.classList.toggle("gt-confirm",active);
 b.setAttribute("aria-label",active?"Are you sure? Click again to "+label.toLowerCase():label);
}
const pearArt='<svg viewBox="0 0 70 80" aria-hidden="true"><path d="M35 20Q31 11 37 4" stroke="#835a39" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M37 15Q44 1 58 8Q53 20 37 15Z" fill="#69a74e" stroke="#416f37" stroke-width="2"/><path d="M35 19C21 19 24 36 15 47C-2 70 22 79 35 77C52 79 71 66 55 47C46 35 50 19 35 19Z" fill="#b7d568" stroke="#628d40" stroke-width="2.5"/><ellipse cx="24" cy="48" rx="7" ry="14" transform="rotate(18 24 48)" fill="#f6f5c5" opacity=".65"/><path d="M48 55q6 7 0 13" stroke="#86ad4c" stroke-width="2" fill="none"/></svg>';
function treeArt(st){
 const sizes=[.26,.5,.75,1],scale=sizes[st]||0;
 return '<svg viewBox="0 0 180 120" aria-hidden="true"><ellipse cx="90" cy="102" rx="59" ry="12" fill="#86684b"/><ellipse cx="90" cy="99" rx="52" ry="9" fill="#b18b5d"/><path d="M9 102l8-14m-8 14-3-9m153 14 7-14" stroke="#57965b" stroke-width="3" fill="none"/>'+(st<0?'': '<g transform="translate(90 100) scale('+scale+') translate(-90 -100)"><path d="M83 101Q89 75 85 43H96Q94 79 99 101Z" fill="#97603d" stroke="#694b36" stroke-width="2"/><path d="M91 70L60 42M94 59L126 39" stroke="#97603d" stroke-width="6" stroke-linecap="round"/><g fill="#6ba655" stroke="#497c40" stroke-width="2"><circle cx="55" cy="41" r="25"/><circle cx="89" cy="24" r="28"/><circle cx="125" cy="41" r="25"/><circle cx="89" cy="48" r="31"/></g><g fill="#a8c875" opacity=".65"><ellipse cx="44" cy="28" rx="12" ry="7"/><ellipse cx="83" cy="10" rx="14" ry="8"/><ellipse cx="115" cy="27" rx="10" ry="6"/></g>'+(st===3?'<g fill="#d1df77" stroke="#61863c" stroke-width="1.5"><path d="M54 43q-4-8-7 1q-13 13 3 16q14-1 4-17Z"/><path d="M90 25q-4-8-7 1q-13 13 3 16q14-1 4-17Z"/><path d="M127 44q-4-8-7 1q-13 13 3 16q14-1 4-17Z"/></g>':'')+'</g>')+'</svg>';
}
function monsterArt(kind){const boss=kind==="boss";return '<svg viewBox="0 0 120 90" aria-hidden="true"><ellipse cx="60" cy="81" rx="43" ry="7" fill="#547352" opacity=".5"/><g stroke="#334237" stroke-width="2.5"><path d="M23 69Q7 57 24 43L36 19Q60 3 84 19L97 43Q114 57 97 69Q85 82 60 79Q35 82 23 69Z" fill="'+(boss?'#886aa1':'#83a36b')+'"/><path d="M32 25L22 6L48 15M87 25L98 6L73 15" fill="'+(boss?'#e4ca88':'#b7c691')+'"/><ellipse cx="44" cy="43" rx="10" ry="12" fill="#fff2c2"/><ellipse cx="76" cy="43" rx="10" ry="12" fill="#fff2c2"/><circle cx="47" cy="45" r="4" fill="#343037"/><circle cx="73" cy="45" r="4" fill="#343037"/><path d="M42 64Q60 54 78 64" fill="none" stroke-linecap="round"/>'+(boss?'<path d="M40 16L32 2L50 10L60 0L70 10L88 2L80 16Z" fill="#f3c469"/>':'')+'</g></svg>';}
function el(p,tag,cls=""){const n=document.createElement(tag);if(cls)n.className=cls;p.append(n);return n;}
function btn(p,label,fn,cls=""){const b=el(p,"button","ptg-theme-exempt "+cls);b.type="button";b.textContent=label;b.onclick=fn;return b;}
function meter(p,name,cls=""){const row=el(p,"div","gt-meter-label"),a=el(row,"span"),v=el(row,"span");a.textContent=name;const bar=el(p,"div","gt-meter "+cls),fill=el(bar,"i");return {v,fill};}
function setMeter(m,f,label){m.v.textContent=label;m.fill.style.width=(100*Math.max(0,Math.min(1,f)))+"%";}
function status(s){$("gt-status").textContent=s;}
function build(){
 const grid=$("gt-plots");
 for(let i=0;i<PLOTS;i++){
  const card=el(grid,"article","gt-plot"),head=el(card,"header"),title=el(head,"h3"),stats=el(head,"span","gt-stats");title.textContent="Plot "+(i+1);
  const art=el(card,"div","gt-plot-art"),picture=el(art,"div");picture.style.cssText="width:100%;height:100%;position:absolute;inset:0";
  const plant=btn(art,"Plant selected pear",()=>send("plant",{plot:i,fruitId:singleId()}));
  const panel=el(card,"div","gt-care"),state=el(panel,"p","gt-small"),growth=meter(panel,"Growth / fruit"),water=meter(panel,"Water","gt-blue"),fert=meter(panel,"Fertilizer","gt-gold");
  const controls=el(panel,"div","gt-plot-controls"),w=btn(controls,"Water",()=>send("water",{plot:i}),"gt-water");
  const qty=el(controls,"input");qty.type="number";qty.min="1";qty.step="1";qty.value="1";qty.setAttribute("aria-label","Fertilizer packs for plot "+(i+1));qty.oninput=render;
  const buy=btn(controls,"Fertilize",()=>send("fertilize",{plot:i,quantity:Number(qty.value)}),"gt-fert");
  const cut=btn(panel,"Cut tree",()=>confirmAction("cut",i,{plot:i}),"gt-cut");
  plots.push({card,title,stats,art,picture,plant,panel,state,growth,water,fert,w,qty,buy,cut,stage:-2});
 }
 for(const kind of ["enemy","boss"]){
  const card=el($("gt-opponents"),"article","gt-opponent"),title=el(card,"h3"),art=el(card,"div","gt-opponent-art");art.innerHTML=monsterArt(kind);
  const detail=el(card,"div","gt-small"),hp=meter(card,"Health","gt-hp"),timer=el(card,"div","gt-small"),reward=el(card,"div","gt-small"),thrower=btn(card,"Throw selected pear",()=>send("throw",{target:kind,fruitId:singleId()}));
  opponents[kind]={card,title,detail,hp,timer,reward,thrower};
 }
}
function render(){
 if(armed&&Date.now()>=armed.until)armed=null;
 const now=Math.max(saved?.lastAt||0,Date.now()+offset);
 // With a server-issued genetics seed, project the exact fruit IDs and stats
 // using the same timestamp integration as the server. Older Workers fall
 // back to confirmed inventory rather than inventing mismatched fruit.
 const projected=saved?advanceGarden(saved,now,()=>.5).state:null;
 visibleInventory=Number.isInteger(saved?.geneticsSeed)?projected.inventory:saved?.inventory||[];
 const available=new Set(visibleInventory.map(p=>p.id));
 for(const id of selected)if(!available.has(id))selected.delete(id);
 if(armed?.kind==="clearInventory"&&armed.id!==selectionKey(allIds()))armed=null;
 if(armed?.kind==="discardMany"&&armed.id!==selectionKey(selectedIds()))armed=null;
 const enabled=eligible()&&!!saved&&!busy&&!failed,pear=visibleInventory.find(p=>p.id===singleId());
 $("gt-login").hidden=!!auth.currentUser||usingLocalFirebaseEmulators;$("gt-retry").hidden=!failed||busy;$("gt-sync").disabled=!enabled;
 $("gt-wallet").textContent=fmt(wallet);$("gt-count").textContent=fmt(visibleInventory.length)+" / "+fmt(inventoryCapacity(saved));$("gt-enemies").textContent=fmt(saved?.enemiesDefeated||0);$("gt-bosses").textContent=fmt(saved?.bossesDefeated||0);
 const pending=visibleInventory.length-(saved?.inventory.length||0);
 $("gt-pending").textContent=pending>0?fmt(pending)+" pear"+(pending===1?"":"s")+" grown · saving shortly":"";
 $("gt-pending").hidden=pending<=0;
 for(let i=0;i<PLOTS;i++){
  const c=plots[i],actual=saved?.plots[i],t=projected?.plots[i],st=t?stage(t):-1;
  if(c.stage!==st){c.picture.innerHTML=treeArt(st);c.stage=st;}
  c.stats.textContent=t?"ATK "+fmt(t.attack)+" · DEF "+fmt(t.defense):"Empty";
  c.art.classList.toggle("gt-empty",!t);c.plant.hidden=!!t;c.plant.disabled=!enabled||!pear;c.panel.hidden=!t;
  if(!t){if(isArmed("cut",i))armed=null;continue;}
  c.state.textContent=stageNames[st]+(t.water===0?" · Needs water":st===3&&projected.inventory.length>=inventoryCapacity(saved)?" · Inventory full":"");
  setMeter(c.growth,st===3?t.fruitWork/FRUIT_WORK:t.growth/growthWork(t),st===3?"Next pear":Math.floor(100*t.growth/growthWork(t))+"%");
  setMeter(c.water,t.water/WATER_MS,time(t.water));
  setMeter(c.fert,t.fertilizer/FERT_MS,t.fertilizer?time(t.fertilizer)+" boost":"None");
  c.w.disabled=!enabled||actual.water===WATER_MS&&t.water===WATER_MS;
  const q=Number(c.qty.value),valid=Number.isSafeInteger(q)&&q>0&&Number.isSafeInteger(q*FERT_COST)&&Number.isSafeInteger(actual.fertilizer+q*FERT_MS);
  c.buy.textContent="Fertilize · "+(valid?fmt(q*FERT_COST):"?")+" ★";c.buy.disabled=!enabled||!valid||wallet<q*FERT_COST;
  c.cut.hidden=st!==3;c.cut.disabled=!enabled||st!==3;confirmationButton(c.cut,isArmed("cut",i)&&st===3,"Cut tree");
 }
 for(const kind of ["enemy","boss"]){
  const c=opponents[kind],op=projected?.[kind],unlocked=!!saved?.[kind==="enemy"?"enemiesUnlocked":"bossesUnlocked"];
  c.title.textContent=(kind==="boss"?"Boss":"Enemy")+" "+(op?op.index+1:1)+(unlocked?"":" · Locked");
  c.card.classList.toggle("gt-locked",!unlocked);
  c.detail.textContent=unlocked?"ATK "+fmt(op.attack)+" · DEF "+fmt(op.defense):"Plant a tree with attack or defense "+(kind==="boss"?5:2)+" to unlock.";
  setMeter(c.hp,unlocked?op.hp/op.maxHp:0,unlocked?fmt(op.hp)+" / "+fmt(op.maxHp):"Locked");
  c.timer.textContent=unlocked&&kind==="boss"?(op.deadline?"Full heal in "+time(op.deadline-now):"30-second battle timer starts on first throw."):unlocked?"Does not attack you.":"";
  c.reward.textContent=unlocked?"Victory reward: "+fmt(Math.floor(dropCoins(op)))+"+ ★":"";
  c.thrower.textContent=pear&&unlocked?"Throw pear · "+fmt(damage(pear,op))+" damage":"Throw selected pear";
  c.thrower.disabled=!enabled||!pear||!unlocked;
 }
 $("gt-selected").textContent=pear?"Selected pear: ATK "+fmt(pear.attack)+" · DEF "+fmt(pear.defense):selected.size>1?fmt(selected.size)+" selected · Discard only; select one to plant or throw.":"Select one pear to plant or throw, or several to discard.";
 $("gt-discard").disabled=!enabled||!selected.size;confirmationButton($("gt-discard"),isArmed("discardMany",selectionKey(selectedIds())),"Discard ("+selected.size+")");
 const ids=allIds();$("gt-clear-inventory").disabled=!enabled||!ids.length;confirmationButton($("gt-clear-inventory"),isArmed("clearInventory",selectionKey(ids)),"Clear all");
 $("gt-clear-selection").disabled=!selected.size;
 $("gt-sort").disabled=!saved;
 const cap=inventoryCapacity(saved),price=inventoryUpgradeCost(saved),full=cap>=INVENTORY_MAX;
 $("gt-upgrade-inventory").textContent=full?"Inventory max":"+"+Math.min(INVENTORY_STEP,INVENTORY_MAX-cap)+" slots · "+fmt(price)+" ★";
 $("gt-upgrade-inventory").disabled=!enabled||full||wallet<price;
 $("gt-upgrade-inventory").title=full?"Storage safety limit reached":"Permanently expand pear inventory for "+fmt(price)+" Star Coins.";
 const signature=JSON.stringify([visibleInventory,selectedIds(),enabled,sortMode]);
 if(signature!==inventorySignature){
  inventorySignature=signature;const inv=$("gt-inventory"),scroller=$("gt-inventory-scroll"),scrollTop=scroller.scrollTop;inv.replaceChildren();
  if(!visibleInventory.length){const empty=el(inv,"p","gt-empty-inventory");empty.textContent=saved?"No pears yet. Water your trees to grow more.":"Loading your pear inventory…";}
  for(const p of sortedPears(visibleInventory,sortMode)){
   const b=btn(inv,"",()=>{armed=null;if(selected.has(p.id))selected.delete(p.id);else selected.add(p.id);render();},"gt-pear");b.innerHTML=pearArt;
   const text=el(b,"small","gt-pear-stats");const attack=el(text,"span"),defense=el(text,"span");attack.textContent="ATK "+fmt(p.attack);defense.textContent="DEF "+fmt(p.defense);b.setAttribute("aria-pressed",String(selected.has(p.id)));b.setAttribute("aria-label","Pear attack "+p.attack+", defense "+p.defense);b.title="ATK "+fmt(p.attack)+" · DEF "+fmt(p.defense);b.disabled=!enabled;
  }
  scroller.scrollTop=scrollTop;
 }
}
async function request(action){
 const user=auth.currentUser;if(!eligible())throw Error("Sign in with a verified Live Firebase account.");
 const idToken=await user.getIdToken();if(auth.currentUser?.uid!==user.uid)throw Error("Account changed.");
 const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken,...action})});
 const data=await r.json();if(!r.ok)throw Error(data.error||"Garden unavailable.");return data;
}
async function send(kind,extras={},retry=false){
 if(!eligible()||busy||(!retry&&failed)||(!saved&&kind!=="sync"&&!retry))return;
 if(kind!=="sync")armed=null;
 const action=retry?failed:{kind,requestId:crypto.randomUUID(),revision:saved?.revision||0,...extras};
 const current=epoch;busy=true;render();status("Saving garden…");
 try{
  const data=await request(action);if(current!==epoch)return;
  if(data.conflict)armed=null;
  saved=data.state;wallet=data.wallet;offset=data.serverNow-Date.now();lastSync=Date.now();failed=null;busy=false;
  // render reconciles selection against the newly projected inventory.
  const fx=data.effects||{};
  for(const id of data.rewards||[])if(!seen.has(id)){seen.add(id);showToast(id==="pearlie"?"You found Pearlie in your pear garden!":"You found Fruiter!");}
  if(fx.coins)showToast("Your garden earned "+fmt(fx.coins)+" Star Coin"+(fx.coins===1?"":"s")+"!");
  status(data.message||(fx.fruits?"Collected "+fmt(fx.fruits)+" pears.":"Garden saved. Growth continues offline."));render();
 }catch(e){if(current!==epoch)return;busy=false;failed=action;status(e.message+" Retry save to recover the same action.");render();}
}
function fullRefresh(){const active=expanded||document.fullscreenElement===area,b=$("gt-fullscreen");b.textContent=active?"⛶ Exit fullscreen":"⛶ Fullscreen";b.setAttribute("aria-pressed",String(active));const stack=$("ptg-toast-stack");if(stack)(active?area:document.body).append(stack);}
function exitExpanded(){if(!expanded)return;expanded=false;area.classList.remove("gt-expanded");document.body.style.overflow=oldOverflow;fullRefresh();}
async function exitFullscreen(){if(expanded)exitExpanded();else if(document.fullscreenElement===area)await document.exitFullscreen().catch(()=>{});}
$("gt-fullscreen").onclick=async()=>{if(expanded||document.fullscreenElement===area){await exitFullscreen();return;}try{if(!area.requestFullscreen)throw Error("Unsupported");await area.requestFullscreen();}catch{oldOverflow=document.body.style.overflow;document.body.style.overflow="hidden";expanded=true;area.classList.add("gt-expanded");fullRefresh();}};
document.addEventListener("fullscreenchange",fullRefresh);document.addEventListener("keydown",e=>{if(e.key==="Escape"){if(armed){armed=null;render();}if(expanded)exitExpanded();}});
$("gt-login").onclick=async()=>{await exitFullscreen();$("auth-open")?.click();};
$("gt-sync").onclick=()=>send("sync");$("gt-retry").onclick=()=>{if(failed)send(failed.kind,{},true);};
$("gt-upgrade-inventory").onclick=()=>send("upgradeInventory");
$("gt-discard").onclick=()=>{const ids=selectedIds();if(ids.length)confirmAction("discardMany",selectionKey(ids),{fruitIds:ids});};
$("gt-clear-inventory").onclick=()=>{const ids=allIds();if(ids.length)confirmAction("clearInventory",selectionKey(ids),{fruitIds:ids});};
$("gt-clear-selection").onclick=()=>{armed=null;selected.clear();render();};
$("gt-sort").onchange=()=>{sortMode=$("gt-sort").value;$("gt-inventory-scroll").scrollTop=0;render();};
build();render();
onAuthStateChanged(auth,user=>{++epoch;armed=null;saved=null;wallet=0;selected.clear();busy=false;failed=null;offset=0;lastSync=0;seen=new Set();render();if(!eligible()){status(usingLocalFirebaseEmulators?"Choose Live Firebase in Settings to play.":!user?"Sign in to grow your pear garden.":"Verify your email to play.");return;}void send("sync");});
setInterval(()=>{if(document.hidden)return;render();if(eligible()&&saved&&!busy&&!failed&&Date.now()-lastSync>=30000)void send("sync");},1000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&eligible()&&!busy&&!failed&&Date.now()-lastSync>=30000)void send("sync");});
