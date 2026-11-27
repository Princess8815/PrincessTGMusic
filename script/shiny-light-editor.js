import {watchStaffRole} from "./staff-auth.js";
import {auth,usingLocalFirebaseEmulators} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {FEATURES,TYPES,COLORS,MOVABLE,ROTATABLE,difficulty,defaultMilestones,validateDesign,validateMilestones,initialBoard,settleLight,applyMove} from "./shiny-light-core.mjs";
import {$,callShiny,renderGrid,tileLabel} from "./shiny-light-ui.js";
let map={title:"New puzzle",width:5,height:5,tiles:[],stars:[],coin:null},milestones=defaultMilestones(),loaded=1,selected=-1,test=null,view=null,busy=false,staff=false,id=null,author=null,cursor=null;
const signed=()=>!!auth.currentUser?.emailVerified&&!usingLocalFirebaseEmulators;
const canEdit=()=>signed()&&(!id||author===auth.currentUser.uid||staff);
const msg=t=>$("se-status").textContent=t;
const testIds=["se-stop","se-check","se-test-reset"];
const label=(value,text)=>{const o=document.createElement("option");o.value=value;o.textContent=text;return o;};
for(const [id,title] of [["inspect","Inspect existing tile"],["erase","Erase tile / overlays"],["star","Star overlay"],["coin","Star Coin overlay"],...FEATURES.map(f=>[f.id,f.name])])$("se-tool").append(label(id,title));
for(let i=0;i<COLORS.length;i++)$("se-color").append(label(i,COLORS[i]));$("se-tool").value="mirror";
function render(){
 $("se-test").hidden=!!test;for(const id of testIds)$(id).hidden=!test;
 for(const control of ["se-load","se-delete","se-publish","se-resize","se-import","se-export","se-save-milestones","se-new","se-community-load","se-browse","se-more"])$(control).disabled=busy||!!test;
 $("se-official").hidden=!staff;$("se-unlock-panel").hidden=!staff;
 $("se-promote").disabled=busy||!!test||!staff||!signed()||!id;
 $("se-save").disabled=busy||!!test||!canEdit();$("se-copy").disabled=busy||!!test||!signed();
 $("se-remove").disabled=busy||!!test||!id||!canEdit();$("se-login").hidden=signed();
 if(test){
  const t=test.board.tiles.find(t=>t.i===selected);
  $("se-test-status").textContent=(view?.black?"Black hole! Board reset.":view?.unstable?"Unstable circuit.":view?.won?"Solved!":"Practice")+(view?" · "+view.stars.length+"/3 stars · "+view.fruit.length+" lit bananas":"")+(t?" · "+tileLabel(t):"");
 }
 renderGrid($("se-grid"),map,test?test.board:{tiles:map.tiles,latched:[]},test?view:null,selected,cell,test?{onMove:(i,to)=>act("move",{i,to}),onError:m=>$("se-test-status").textContent=m}:{});
}
function cell(i){
 selected=i;if(test){const t=test.board.tiles.find(t=>t.i===i);if(ROTATABLE.has(t?.type)){act("rotate",{i});return;}render();return;}
 const tool=$("se-tool").value,idx=map.tiles.findIndex(t=>t.i===i),t=map.tiles[idx];
 if(tool==="inspect"){
  if(t){$("se-dir").value=t.dir??0;$("se-axis").value=t.axis??"h";$("se-color").value=t.color??1;$("se-power").value=t.power??1;$("se-id").value=t.id??"A";$("se-buttons").value=(t.buttons||[]).join(",");}
  msg(t?tileLabel(t):"Empty cell");render();return;
 }
 if(tool==="erase"){if(idx>=0)map.tiles.splice(idx,1);map.stars=map.stars.filter(x=>x!==i);if(map.coin===i)map.coin=null;}
 else if(tool==="star"){if(map.stars.includes(i))map.stars=map.stars.filter(x=>x!==i);else if(map.stars.length<3)map.stars.push(i);else msg("Three stars already placed. Remove one first.");}
 else if(tool==="coin"){map.coin=map.coin===i?null:i;}
 else if(TYPES.includes(tool)){
  if(idx>=0)map.tiles.splice(idx,1);
  if(tool==="source")map.tiles=map.tiles.filter(x=>x.type!=="source");
  map.tiles.push({i,type:tool,dir:Number($("se-dir").value),axis:$("se-axis").value,color:Number($("se-color").value),power:Number($("se-power").value),id:$("se-id").value.trim()||"A",buttons:$("se-buttons").value.split(",").map(x=>x.trim()).filter(Boolean)});
 }
 render();
}
function fields(){map.title=$("se-title").value;return map;}
function showMap(d,newId=null,newAuthor=null){id=newId;author=newAuthor;$("se-id").value=id||"";$("se-share").replaceChildren();if(id){const link=new URL(location.href);link.search="";link.searchParams.set("level",id);const a=document.createElement("a");a.href=link.href;a.textContent="Share this community map";$("se-share").append(a);}map=structuredClone(d);$("se-width").value=map.width;$("se-height").value=map.height;$("se-title").value=map.title;selected=-1;render();}
function showMilestones(){const el=$("se-milestones");el.replaceChildren();for(const f of FEATURES){const l=document.createElement("label"),i=document.createElement("input");i.type="number";i.min=1;i.max=1000000;i.value=milestones[f.id];i.dataset.feature=f.id;if(["source","fruit","mirror"].includes(f.id))i.disabled=true;l.append(f.name,i);el.append(l);}}
function level(){const n=Number($("se-level").value);if(!Number.isInteger(n)||n<1||n>1000000)throw Error("Enter a level from 1 to 1,000,000.");return n;}
async function run(fn){if(busy||test)return;busy=true;render();try{await fn();}catch(e){msg(e.message);}finally{busy=false;render();}}
function load(){return run(async()=>{const n=level(),data=await callShiny({action:"load",level:n},true);loaded=n;milestones=data.milestones;showMilestones();showMap(data.design);msg((data.official?"Official":"Procedural fallback")+" level "+n+" · "+difficulty(n));});}
$("se-load").onclick=load;
$("se-resize").onclick=()=>{const w=Number($("se-width").value),h=Number($("se-height").value);if(!Number.isInteger(w)||!Number.isInteger(h)||w<3||w>15||h<3||h>15){msg("Use grid dimensions from 3 to 15.");return;}if(confirm("Clear the grid and start a new design?"))showMap({title:$("se-title").value,width:w,height:h,tiles:[],stars:[],coin:null});};
$("se-publish").onclick=()=>run(async()=>{const n=level(),design=validateDesign(fields(),n,milestones);if(!confirm("Publish this grid as official level "+n+"? Existing attempts keep their saved board until replay."))return;await callShiny({action:"publish",level:n,design},true);loaded=n;showMap(design);msg("Published official level "+n+".");});
$("se-delete").onclick=()=>run(async()=>{const n=level();if(!confirm("Remove official level "+n+"? The procedural fallback will be used."))return;await callShiny({action:"delete",level:n},true);const data=await callShiny({action:"load",level:n},true);showMap(data.design);msg("Official override removed.");});
$("se-save-milestones").onclick=()=>run(async()=>{const next=validateMilestones(Object.fromEntries([...$("se-milestones").querySelectorAll("input")].map(i=>[i.dataset.feature,Number(i.value)])));if(!confirm("Save unlocks? Existing official levels may need editing if a feature becomes locked."))return;await callShiny({action:"milestones",milestones:next},true);milestones=next;msg("Unlock schedule saved.");});
$("se-import").onclick=()=>{try{showMap(validateDesign(JSON.parse($("se-json").value),level(),milestones,false));msg("Imported locally. Publish to save.");}catch(e){msg(e.message);}};
$("se-export").onclick=()=>{$("se-json").value=JSON.stringify(fields(),null,2);msg("Level JSON ready to copy.");};
function startTest(){const d=validateDesign(fields(),1,milestones,false);map=d;view=settleLight(d,initialBoard(d));test={board:view.board};selected=-1;render();}
$("se-test").onclick=()=>{try{startTest();msg("Practice only. No Star Coins, stars or collectibles are awarded.");}catch(e){msg(e.message);}};
$("se-stop").onclick=()=>{test=null;view=null;selected=-1;$("se-test-status").textContent="";render();};
$("se-test-reset").onclick=()=>{view=settleLight(map,initialBoard(map));test.board=view.board;selected=-1;render();};
function act(kind,extra={}){if(!test)return;try{const r=applyMove(map,test.board,{kind,...extra});test.board=r.board;view=r;selected=-1;render();}catch(e){$("se-test-status").textContent=e.message;}}
$("se-check").onclick=()=>act("check");
$("se-login").onclick=()=>document.getElementById("auth-open")?.click();
$("se-new").onclick=()=>{if(!busy&&!test&&confirm("Start a new map? Unsaved changes will be replaced.")){showMap({title:"New puzzle",width:5,height:5,tiles:[],stars:[],coin:null});msg("New community map.");}};
function save(copy=false){return run(async()=>{const design=validateDesign(fields(),1,milestones,false);const uid=auth.currentUser?.uid;const data=await callShiny({action:"saveCommunity",id:copy?undefined:id||undefined,design},true);showMap(design,data.id,copy||!author?uid:author);msg("Community map saved. Share its link or code.");});}
$("se-save").onclick=()=>save();$("se-copy").onclick=()=>save(true);
async function loadCommunity(code){const data=await callShiny({action:"loadCommunity",id:code},true);showMap(data.design,data.id,data.authorUid);msg("Community map loaded. Start local test to play.");}
$("se-community-load").onclick=()=>run(()=>loadCommunity($("se-id").value.trim()));
$("se-remove").onclick=()=>run(async()=>{if(!id||!confirm("Delete this community map? Official copies will remain."))return;await callShiny({action:"deleteCommunity",id},true);showMap(fields());msg("Community map deleted.");});
async function browse(reset){if(reset){cursor=null;$("se-list").replaceChildren();}const data=await callShiny({action:"browse",cursor},true);cursor=data.cursor;
 for(const item of data.levels){const button=document.createElement("button");button.textContent=item.title;button.onclick=()=>run(()=>loadCommunity(item.id));$("se-list").append(button);}
 $("se-more").hidden=!cursor;msg(data.levels.length?"Community maps loaded.":"No more community maps.");}
$("se-browse").onclick=()=>run(()=>browse(true));$("se-more").onclick=()=>run(()=>browse(false));
$("se-promote").onclick=()=>run(async()=>{if(!staff||!id)throw Error("Load a saved community map first.");const n=level();if(!confirm("Copy the saved community map to official level "+n+"? Unsaved edits will not be included."))return;await callShiny({action:"promote",id,level:n},true);const data=await callShiny({action:"load",level:n},true);showMap(data.design);msg("Community map promoted to official level "+n+".");});
showMilestones();showMap(map);
watchStaffRole(ok=>{staff=ok===true;render();});onAuthStateChanged(auth,()=>render());
const shared=new URLSearchParams(location.search).get("level");
void run(async()=>{try{const data=await callShiny({action:"config"},true);milestones=data.milestones;showMilestones();}catch(error){msg("Live schedule unavailable. Local editing is still available.");}if(shared)await loadCommunity(shared);});

