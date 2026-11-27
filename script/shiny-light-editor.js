import {guardStaffPage} from "./staff-auth.js";
import {FEATURES,TYPES,COLORS,MOVABLE,ROTATABLE,difficulty,defaultMilestones,validateDesign,validateMilestones,initialBoard,settleLight,applyMove} from "./shiny-light-core.mjs";
import {$,callShiny,renderGrid,tileLabel} from "./shiny-light-ui.js";
let map={title:"New puzzle",width:5,height:5,tiles:[],stars:[],coin:null},milestones=defaultMilestones(),loaded=1,selected=-1,test=null,view=null,busy=false;
const msg=t=>$("se-status").textContent=t;
const testIds=["se-stop","se-check","se-test-reset"];
const label=(value,text)=>{const o=document.createElement("option");o.value=value;o.textContent=text;return o;};
for(const [id,title] of [["inspect","Inspect existing tile"],["erase","Erase tile / overlays"],["star","Star overlay"],["coin","Star Coin overlay"],...FEATURES.map(f=>[f.id,f.name])])$("se-tool").append(label(id,title));
for(let i=0;i<COLORS.length;i++)$("se-color").append(label(i,COLORS[i]));$("se-tool").value="mirror";
function render(){
 $("se-test").hidden=!!test;for(const id of testIds)$(id).hidden=!test;
 for(const id of ["se-load","se-delete","se-publish","se-resize","se-import","se-export","se-save-milestones"])$(id).disabled=busy||!!test;
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
function showMap(d){map=structuredClone(d);$("se-width").value=map.width;$("se-height").value=map.height;$("se-title").value=map.title;selected=-1;render();}
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
function startTest(){const d=validateDesign(fields(),level(),milestones);map=d;view=settleLight(d,initialBoard(d));test={board:view.board};selected=-1;render();}
$("se-test").onclick=()=>{try{startTest();msg("Practice only. No Star Coins, stars or collectibles are awarded.");}catch(e){msg(e.message);}};
$("se-stop").onclick=()=>{test=null;view=null;selected=-1;$("se-test-status").textContent="";render();};
$("se-test-reset").onclick=()=>{view=settleLight(map,initialBoard(map));test.board=view.board;selected=-1;render();};
function act(kind,extra={}){if(!test)return;try{const r=applyMove(map,test.board,{kind,...extra});test.board=r.board;view=r;selected=-1;render();}catch(e){$("se-test-status").textContent=e.message;}}
$("se-check").onclick=()=>act("check");
if(await guardStaffPage({redirectURL:"shiny-light.html"})){showMilestones();showMap(map);await load();}
