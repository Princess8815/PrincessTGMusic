
import {auth,usingLocalFirebaseEmulators} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {advance,caps,fruitInterval,autoInterval,yieldPerFruit,starChance,treePrice,prestigePrice,upgradePrice,MAX_TREES,MAX_PRESTIGE,growDuration} from "./cherry-empire-core.mjs";
import {showToast} from "./toast-sound.js";
const $=id=>document.getElementById(id),grid=$("ce-orchard"),endpoint="https://princesstg-cd-store-live.transgirl1991.workers.dev/games/cherry-empire";
const fmt=n=>Math.floor(n).toLocaleString(),eligible=()=>!!auth.currentUser?.emailVerified&&!usingLocalFirebaseEmulators;
let saved=null,offset=0,busy=false,failed=null,epoch=0,lastSync=0,seen=new Set();
const cards=new Map();
const treeArt='<svg viewBox="0 0 160 115" aria-hidden="true"><ellipse cx="80" cy="105" rx="48" ry="6" fill="#84b77b"/><g class="ce-canopy"><path d="M74 104L73 49H87L86 104Z" fill="#8e5738"/><path d="M80 70L52 44M83 65L108 43" stroke="#8e5738" stroke-width="7" stroke-linecap="round"/><g fill="#58a45e" stroke="#3e7945" stroke-width="2"><circle cx="48" cy="45" r="25"/><circle cx="79" cy="26" r="26"/><circle cx="112" cy="45" r="25"/><circle cx="79" cy="55" r="28"/></g><g class="ce-fruits" fill="#e74a68" stroke="#9f294b" stroke-width="1.4"><path d="M43 44Q51 34 51 27Q51 37 59 45M90 66Q99 56 99 49Q99 60 107 66M92 26Q100 17 100 12Q100 20 108 28" fill="none" stroke="#38613d" stroke-width="2"/><circle cx="43" cy="45" r="6"/><circle cx="59" cy="46" r="6"/><circle cx="90" cy="67" r="6"/><circle cx="107" cy="68" r="6"/><circle cx="92" cy="28" r="6"/><circle cx="108" cy="29" r="6"/></g></g></svg>';
const now=()=>Date.now()+offset;
const duration=ms=>{let s=Math.max(0,Math.ceil(ms/1000)),d=Math.floor(s/86400),h=Math.floor(s/3600)%24,m=Math.floor(s/60)%60;return d?d+"d "+h+"h":h?h+"h "+m+"m":m?m+"m "+s%60+"s":s+"s";};
function status(s){$("ce-status").textContent=s;}
function button(parent,label,click){const b=document.createElement("button");b.type="button";b.textContent=label;b.addEventListener("click",click);parent.append(b);return b;}
function element(parent,tag,cls=""){const el=document.createElement(tag);if(cls)el.className=cls;parent.append(el);return el;}
function makeCard(t){
 const card=element(grid,"article","ce-tree"),header=element(card,"header"),title=element(header,"h2"),badge=element(header,"span","ce-badge"),art=element(card,"div","ce-tree-art");
 title.textContent="Cherry tree "+t.id;art.innerHTML=treeArt;
 const fruitRow=element(card,"div","ce-fruit-row"),fruit=element(fruitRow,"strong"),yieldText=element(fruitRow,"span");
 const progress=element(card,"div","ce-progress"),fill=element(progress,"span"),timer=element(card,"p","ce-tree-status");
 const harvest=button(card,"Harvest",()=>send("harvest",{treeId:t.id}));
 const upgrades=element(card,"div","ce-upgrades"),up={};
 for(const [k,name] of [["speed","Fruit speed"],["yield","Cherry yield"],["auto","Auto harvester"],["star","Star Coin chance"]]){
  const b=button(upgrades,"",()=>send("upgrade",{treeId:t.id,upgrade:k}));b.dataset.upgrade=k;
  const label=element(b,"span");label.textContent=name;const detail=element(b,"small");up[k]={b,detail};
 }
 const prestige=button(card,"Prestige",()=>{const actual=saved?.trees.find(x=>x.id===t.id);if(actual&&confirm("Prestige tree "+t.id+"? Regular upgrades reset and the tree must regrow. Permanent Star Coin upgrades stay."))send("prestige",{treeId:t.id});});prestige.className="ce-prestige";
 const result={card,badge,art,fruit,yieldText,fill,timer,harvest,up,prestige};cards.set(t.id,result);return result;
}
function render(){
 const active=eligible()&&!!saved&&!busy&&!failed;
 $("ce-login").hidden=!!auth.currentUser||usingLocalFirebaseEmulators;
 $("ce-retry").hidden=!failed||busy;
 $("ce-sync").disabled=!active;
 if(!saved){$("ce-buy").disabled=true;$("ce-all").disabled=true;$("ce-cherries").textContent="0";$("ce-tree-count").textContent="0";$("ce-harvests").textContent="0";grid.replaceChildren();cards.clear();return;}
 const time=Math.max(saved.lastAt,now()),projection=advance(saved,time),s=projection.state;
 $("ce-cherries").textContent=fmt(s.cherries);$("ce-tree-count").textContent=s.trees.length+"/"+MAX_TREES;$("ce-harvests").textContent=fmt(s.totalHarvests);
 $("ce-buy").textContent=s.trees.length>=MAX_TREES?"Orchard full":"Plant tree · "+fmt(treePrice(s.trees.length))+" 🍒";
 $("ce-buy").title="Growth time: "+duration(growDuration(s.trees.length));$("ce-buy").disabled=!active||s.trees.length>=MAX_TREES||s.cherries<treePrice(s.trees.length);
 $("ce-all").disabled=!active||!s.trees.some(t=>t.fruit>0);
 for(const t of s.trees){
  const c=cards.get(t.id)||makeCard(t),growing=time<t.matureAt,cap=caps(t),interval=fruitInterval(t);
  c.badge.textContent="Prestige "+t.prestige;c.art.dataset.growing=String(growing);
  c.fruit.textContent=fmt(t.fruit)+" ripe fruit · "+fmt(t.pendingCherries)+" 🍒";
  c.yieldText.textContent=yieldPerFruit(t)+" 🍒 / fruit";
  c.fill.style.width=(growing?0:100*Math.max(0,Math.min(1,1-(t.nextFruitAt-time)/interval)))+"%";
  c.timer.textContent=growing?"Growing · "+duration(t.matureAt-time)+" remaining":"Next fruit in "+duration(t.nextFruitAt-time)+(t.auto?" · auto harvest in "+duration(t.nextAutoAt-time):" · manual harvest");
  c.harvest.textContent="Harvest "+fmt(t.pendingCherries)+" 🍒";c.harvest.disabled=!active||!t.fruit;
  for(const k of Object.keys(c.up)){
   const {b,detail}=c.up[k],max=t[k]>=cap[k],price=upgradePrice(t,k);
   const stat=k==="speed"?duration(interval)+" / fruit":k==="yield"?yieldPerFruit(t)+" 🍒 / fruit":k==="auto"?(t.auto?"Every "+duration(autoInterval(t)):"Off"):(starChance(t)*100).toFixed(2)+"% · permanent";
   detail.textContent=t[k]+"/"+cap[k]+" · "+stat+(max?" · MAX":" · "+fmt(price)+" 🍒");
   b.disabled=!active||max||s.cherries<price;
  }
  const ready=t.speed===cap.speed&&t.yield===cap.yield&&t.prestige<MAX_PRESTIGE;
  c.prestige.textContent=t.prestige>=MAX_PRESTIGE?"Prestige max":ready?"Prestige · "+fmt(prestigePrice(t))+" 🍒":"Prestige · max speed & yield first";
  c.prestige.disabled=!active||!ready||s.cherries<prestigePrice(t);
 }
}
async function request(action){
 const user=auth.currentUser;if(!eligible())throw Error("Sign in with a verified Live Firebase account.");
 const idToken=await user.getIdToken();if(auth.currentUser?.uid!==user.uid)throw Error("Account changed.");
 const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken,...action})});
 const data=await res.json();if(!res.ok)throw Error(data.error||"Orchard service unavailable.");return data;
}
async function send(kind,extras={},retry=false){
 if(!eligible()||busy||(!retry&&failed)||(!saved&&kind!=="sync"&&!retry))return;
 const action=retry?failed:{kind,requestId:crypto.randomUUID(),revision:saved?.revision||0,...extras};
 const current=epoch;busy=true;render();status(kind==="sync"?"Refreshing orchard…":"Saving orchard…");
 try{
  const data=await request(action);if(current!==epoch)return;
  saved=data.state;offset=data.serverNow-Date.now();lastSync=Date.now();failed=null;busy=false;
  const fx=data.effects||{};
  for(const id of data.rewards||[]){if(seen.has(id))continue;seen.add(id);showToast(id==="cheribelle"?"You discovered Cheribelle in your cherry orchard!":"You found Fruiter!");}
  if(fx.coins>0)showToast("Your orchard harvested "+fmt(fx.coins)+" Star Coin"+(fx.coins===1?"":"s")+"!");
  status(data.message||((fx.harvests||0)>0?"Saved "+fmt(fx.cherries)+" cherries from "+fmt(fx.harvests)+" harvests.":"Orchard saved. Growth continues offline."));
  render();
 }catch(e){if(current!==epoch)return;busy=false;failed=action;status(e.message+" Use Retry save to check the same request.");render();}
}
$("ce-login").onclick=()=>$("auth-open")?.click();
$("ce-buy").onclick=()=>send("buyTree");
$("ce-all").onclick=()=>send("harvestAll");
$("ce-sync").onclick=()=>send("sync");
$("ce-retry").onclick=()=>{if(failed)send(failed.kind,{},true);};
onAuthStateChanged(auth,user=>{
 ++epoch;saved=null;failed=null;busy=false;offset=0;lastSync=0;seen=new Set();render();
 if(!eligible()){status(usingLocalFirebaseEmulators?"Choose Live Firebase in Settings to play.":!user?"Sign in to grow your orchard.":"Verify your email to play.");return;}
 void send("sync");
});
setInterval(()=>{if(document.hidden)return;render();if(eligible()&&saved&&!failed&&!busy&&Date.now()-lastSync>=60000)void send("sync");},1000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&eligible()&&!failed&&!busy&&Date.now()-lastSync>=60000)void send("sync");});
render();
