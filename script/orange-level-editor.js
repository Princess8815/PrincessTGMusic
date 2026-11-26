
import {auth,db,usingLocalFirebaseEmulators} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {doc,getDocFromServer} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {WIDTH,HEIGHT,GROUND,SLING,MATERIALS,EDIT_GRID,MAX_PIECES,MAX_ORANGES,validateDesign,designMap,boardFromMap,sceneMap} from "./orange-knock-down-core.mjs";
import {editorRequest} from "./orange-editor-api.js";
const $=id=>document.getElementById(id),grid=$("oe-grid"),status=m=>$("oe-status").textContent=m,ns="http://www.w3.org/2000/svg";
const blank=()=>({title:"My orchard",shots:5,two:1,three:3,gravity:true,pieces:[],oranges:[]});
let design=blank(),selected=null,id=null,staff=false,busy=false,cursor=null,undo=[],redo=[],pointer=null,ghost=null,ghostKey="",displayed=null,editingOfficial=null;
const draftKey="ptg-orange-editor-draft-v1";
const clone=x=>JSON.parse(JSON.stringify(x)),number=id=>Number($(id).value),snap=(v,lo,hi)=>Math.max(lo,Math.min(hi,Math.round(v/EDIT_GRID)*EDIT_GRID));
function option(parent,value,label){const o=document.createElement("option");o.value=value;o.textContent=label;parent.append(o);return o;}
for(const [id,label] of [["select","Select / move"],["orange","Orange"],...Object.entries(MATERIALS).map(([k,m])=>[k,m.label])])option($("oe-tool"),id,label);
$("oe-tool").value="wood";
const palette=new Map();
for(const o of $("oe-tool").options){
 const b=document.createElement("button");b.type="button";b.className="oe-tool-button";b.dataset.tool=o.value;
 const swatch=document.createElement("span");swatch.className="oe-swatch";
 if(MATERIALS[o.value]){swatch.style.background=MATERIALS[o.value].color;swatch.style.borderColor=MATERIALS[o.value].edge;}
 else if(o.value==="orange"){swatch.style.background="#f6a12d";swatch.style.borderRadius="50%";}
 else{swatch.textContent="↔";swatch.style.background="#d5e9e6";}
 const label=document.createElement("span");label.textContent=o.textContent;b.append(swatch,label);
 b.onclick=()=>{if(busy)return;$("oe-tool").value=o.value;clearGhost();renderPalette();};
 $("oe-palette").append(b);palette.set(o.value,b);
}
function renderPalette(){for(const [id,b] of palette)b.setAttribute("aria-pressed",String($("oe-tool").value===id));}
$("oe-tool").onchange=()=>{clearGhost();renderPalette();};
function readMeta(){design.title=$("oe-title").value;design.shots=number("oe-shots");design.two=number("oe-two");design.three=number("oe-three");}
function writeMeta(){for(const k of ["title","shots","two","three"])$("oe-"+k).value=design[k];}
function remember(){readMeta();undo.push(clone(design));if(undo.length>60)undo.shift();redo=[];}
function persist(){readMeta();try{localStorage.setItem(draftKey,JSON.stringify({design,id,editingOfficial}));}catch{}}
function svg(tag,attrs,parent=grid){const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));parent.append(e);return e;}
// A preview uses the same solver as official and test levels. Temporary
// metadata/dummy fruit permit an unfinished empty draft to be previewed.
function preview(d){
 const input={...d,title:"Preview",shots:5,two:1,three:3,gravity:true,pieces:d.pieces.map(p=>({...p,supports:[]})),oranges:d.oranges.length?d.oranges.map(o=>({...o,branch:-1})):[{x:940,y:20,branch:-1}]};
 try{const map=designMap(input),board=boardFromMap(map),scene=sceneMap(map,board);return {pieces:d.pieces.map((p,i)=>({...p,y:(scene.branches[i].y1+scene.branches[i].y2)/2})),oranges:d.oranges.map((o,i)=>({...o,y:scene.oranges[i].y}))};}
 catch{return {pieces:d.pieces,oranges:d.oranges};}
}
function clearGhost(){ghost?.remove();ghost=null;ghostKey="";}
function render(){
 $("oe-official-editing").textContent=editingOfficial?"Editing official level "+editingOfficial+" · Save official level to update it.":"Choose a level to edit.";
 clearGhost();displayed=preview(design);renderPalette();
 grid.replaceChildren();svg("rect",{width:WIDTH,height:HEIGHT,fill:"#d5e9e6"});svg("rect",{x:0,y:GROUND,width:WIDTH,height:HEIGHT-GROUND,fill:"#77a45d"});svg("rect",{x:0,y:0,width:160,height:GROUND,fill:"#b4c8cb",opacity:.65});
 for(let x=160;x<=WIDTH;x+=EDIT_GRID)svg("line",{x1:x,y1:0,x2:x,y2:GROUND,stroke:"#aac5c0","stroke-width":.7});
 for(let y=0;y<GROUND;y+=EDIT_GRID)svg("line",{x1:160,y1:y,x2:WIDTH,y2:y,stroke:"#aac5c0","stroke-width":.7});
 svg("path",{d:"M98 502V368M98 502L132 368",stroke:"#895937","stroke-width":10,fill:"none"});svg("circle",{cx:SLING.x,cy:SLING.y,r:15,fill:"#ffa9c3"});
 displayed.pieces.forEach((p,i)=>{const m=MATERIALS[p.material];if(!m)return;const g=svg("g",{transform:"translate("+p.x+" "+p.y+") rotate("+p.angle+")","data-kind":"pieces","data-index":i});svg("rect",{x:-p.length/2,y:-m.width/2,width:p.length,height:m.width,rx:2,fill:m.color,stroke:selected?.kind==="pieces"&&selected.index===i?"#ffef71":m.edge,"stroke-width":selected?.kind==="pieces"&&selected.index===i?5:2},g);const txt=svg("text",{x:0,y:4,"text-anchor":"middle","font-size":12,fill:"#292725","pointer-events":"none"},g);txt.textContent=i+1;});
 displayed.oranges.forEach((o,i)=>{const g=svg("g",{"data-kind":"oranges","data-index":i});svg("circle",{cx:o.x,cy:o.y,r:14,fill:"#f6a12d",stroke:selected?.kind==="oranges"&&selected.index===i?"#fff47f":"#bb6b21","stroke-width":selected?.kind==="oranges"&&selected.index===i?5:2},g);svg("ellipse",{cx:o.x+6,cy:o.y-14,rx:7,ry:3,fill:"#57914b"},g);});
 if(selected){const raw=design[selected.kind][selected.index],landed=displayed[selected.kind][selected.index];if(raw&&landed)$("oe-landed").textContent="Selected landing: X "+Math.round(landed.x)+" · Y "+Math.round(landed.y)+(Math.abs(raw.y-landed.y)>1?" (gravity settles it)":"");}else $("oe-landed").textContent="Gravity preview: pieces and oranges settle automatically.";
 $("oe-count").textContent=design.pieces.length+" / "+MAX_PIECES+" pieces · "+design.oranges.length+" / "+MAX_ORANGES+" oranges";
 const s=$("oe-selection");s.replaceChildren();option(s,"","None");for(const [kind,items] of [["pieces",design.pieces],["oranges",design.oranges]])items.forEach((v,i)=>option(s,kind+":"+i,kind==="pieces"?String(i+1)+". "+MATERIALS[v.material].label:"Orange "+(i+1)));s.value=selected?selected.kind+":"+selected.index:"";
 const supp=$("oe-support"),os=$("oe-orange-support");supp.replaceChildren();os.replaceChildren();option(os,-1,"None / independent");const q=selected?design[selected.kind][selected.index]:null;
 design.pieces.forEach((v,i)=>{if(selected?.kind!=="pieces"||selected.index!==i){const o=option(supp,i,"Piece "+(i+1));o.selected=!!q?.supports?.includes(i);}option(os,i,"Piece "+(i+1));});os.value=String(q?.branch??-1);
 supp.disabled=selected?.kind!=="pieces";os.disabled=selected?.kind!=="oranges";$("oe-delete").disabled=!selected;$("oe-undo").disabled=!undo.length;$("oe-redo").disabled=!redo.length;$("oe-remove").disabled=!id||busy;
 persist();
}
function select(kind,index){selected=kind?{kind,index}:null;if(selected){const q=design[kind][index];$("oe-x").value=q.x;$("oe-y").value=q.y;if(kind==="pieces"){$("oe-angle").value=q.angle;$("oe-length").value=q.length;}}render();}
function candidate(x,y,tool=$("oe-tool").value){
 const existing=tool==="select"&&selected?design[selected.kind][selected.index]:null;
 if(tool==="select"&&!existing)return null;
 const kind=tool==="orange"||selected?.kind==="oranges"&&tool==="select"?"oranges":"pieces";
 const material=existing?.material||tool;
 const angle=((Math.round(number("oe-angle")||0)%360)+360)%360,length=snap(number("oe-length")||100,20,240);
 let loX=180,hiX=940,loY=20,hiY=480;
 if(kind==="pieces"){
  const m=MATERIALS[material],rad=angle*Math.PI/180,r=m.width/2,dx=Math.abs(Math.cos(rad)*length/2)+r,dy=Math.abs(Math.sin(rad)*length/2)+r;
  loX=Math.max(180,Math.ceil((160+dx)/EDIT_GRID)*EDIT_GRID);hiX=Math.min(940,Math.floor((WIDTH-dx)/EDIT_GRID)*EDIT_GRID);
  loY=Math.max(20,Math.ceil(dy/EDIT_GRID)*EDIT_GRID);hiY=Math.min(480,Math.floor((GROUND-dy)/EDIT_GRID)*EDIT_GRID);
 }
 const xx=snap(x,loX,hiX),yy=snap(y,loY,hiY);
 return {kind,value:kind==="pieces"?{material,x:xx,y:yy,angle,length,supports:[]}:{x:xx,y:yy,branch:-1},index:tool==="select"?selected.index:design[kind].length};
}
function withCandidate(q){
 const copy=clone(design);copy[q.kind][q.index]=q.value;return copy;
}
function placement(x,y){
 if(busy)return;
 const tool=$("oe-tool").value,q=candidate(x,y,tool);
 if(!q)return status("Choose a piece to move first.");
 if(tool!=="select"&&design[q.kind].length>=(q.kind==="pieces"?MAX_PIECES:MAX_ORANGES))return status("Object limit reached.");
 remember();design[q.kind][q.index]=q.value;selected={kind:q.kind,index:q.index};
 $("oe-x").value=q.value.x;$("oe-y").value=q.value.y;
 if(q.kind==="pieces"){$("oe-angle").value=q.value.angle;$("oe-length").value=q.value.length;}
 render();const landed=displayed[q.kind][q.index];status(Math.abs(landed.y-q.value.y)>1?"Placed: gravity settles it onto the nearest surface.":"Placed.");
}
function gridPoint(e){const p=grid.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(grid.getScreenCTM().inverse());}
function previewAt(x,y){
 const q=candidate(x,y);if(!q)return clearGhost();
 if($("oe-tool").value!=="select"&&design[q.kind].length>=(q.kind==="pieces"?MAX_PIECES:MAX_ORANGES))return clearGhost();
 const key=JSON.stringify(q);if(key===ghostKey)return;
 clearGhost();ghostKey=key;
 const landed=preview(withCandidate(q))[q.kind][q.index],raw=q.value;
 if(!landed)return;
 ghost=svg("g",{"pointer-events":"none"});
 const paint=(v,outline)=>{if(q.kind==="pieces"){const m=MATERIALS[v.material],g=svg("g",{transform:"translate("+v.x+" "+v.y+") rotate("+v.angle+")"},ghost);svg("rect",{x:-v.length/2,y:-m.width/2,width:v.length,height:m.width,rx:2,fill:outline?"none":m.color,stroke:outline?"#735a38":"#347b38","stroke-width":3,"stroke-dasharray":outline?"6 4":"none",opacity:outline?.65:.85},g);}else svg("circle",{cx:v.x,cy:v.y,r:14,fill:outline?"none":"#f6a12d",stroke:outline?"#735a38":"#347b38","stroke-width":3,"stroke-dasharray":outline?"6 4":"none",opacity:outline?.65:.85},ghost);};
 if(Math.abs(landed.y-raw.y)>1){paint(raw,true);svg("line",{x1:raw.x,y1:raw.y,x2:landed.x,y2:landed.y,stroke:"#347b38","stroke-width":2,"stroke-dasharray":"5 5"},ghost);}
 paint(landed,false);
}
grid.addEventListener("pointerdown",e=>{
 if(busy||pointer||!e.isPrimary||e.button!==0)return;const q=gridPoint(e);if(q.x<160||q.x>WIDTH||q.y<0||q.y>HEIGHT)return;
 e.preventDefault();const tool=$("oe-tool").value,hit=e.target.closest("[data-kind]");let dx=0,dy=0,justSelect=false;
 if(tool==="select"&&hit){
  select(hit.dataset.kind,Number(hit.dataset.index));const v=displayed[selected.kind][selected.index];dx=v.x-q.x;dy=v.y-q.y;justSelect=true;
 }
 if(tool==="select"&&!selected)return;
 pointer={id:e.pointerId,startX:e.clientX,startY:e.clientY,dx,dy,justSelect};
 try{grid.setPointerCapture(e.pointerId);}catch{}
 if(!justSelect)previewAt(q.x+dx,q.y+dy);
});
grid.addEventListener("pointermove",e=>{
 if(busy)return;const q=gridPoint(e);
 if(pointer?.id===e.pointerId){e.preventDefault();if(!pointer.justSelect||Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY)>4)previewAt(q.x+pointer.dx,q.y+pointer.dy);}
 else if(!pointer&&e.pointerType==="mouse"&&$("oe-tool").value!=="select"&&q.x>=160&&q.x<=WIDTH&&q.y>=0&&q.y<=HEIGHT)previewAt(q.x,q.y);
 else if(!pointer)clearGhost();
});
grid.addEventListener("pointerup",e=>{
 if(pointer?.id!==e.pointerId)return;const old=pointer,q=gridPoint(e);pointer=null;clearGhost();
 if(!old.justSelect||Math.hypot(e.clientX-old.startX,e.clientY-old.startY)>4)placement(q.x+old.dx,q.y+old.dy);
});
function cancelPointer(e){if(pointer?.id===e.pointerId){pointer=null;clearGhost();}}
grid.addEventListener("pointercancel",cancelPointer);grid.addEventListener("lostpointercapture",cancelPointer);grid.addEventListener("pointerleave",()=>{if(!pointer)clearGhost();});
grid.addEventListener("keydown",e=>{
 if(busy||!selected)return;
 const offsets={ArrowLeft:[-EDIT_GRID,0],ArrowRight:[EDIT_GRID,0],ArrowUp:[0,-EDIT_GRID],ArrowDown:[0,EDIT_GRID]};
 if(!offsets[e.key])return;e.preventDefault();$("oe-tool").value="select";const v=design[selected.kind][selected.index],delta=offsets[e.key];placement(v.x+delta[0],v.y+delta[1]);
});
$("oe-selection").onchange=()=>{const [kind,i]=$("oe-selection").value.split(":");$("oe-tool").value="select";select(kind||null,Number(i));};
$("oe-place").onclick=()=>placement(number("oe-x"),number("oe-y"));
function rotate(delta){if(busy)return;const a=((number("oe-angle")+delta)%360+360)%360;$("oe-angle").value=a;clearGhost();if(selected?.kind==="pieces"&&$("oe-tool").value==="select"){const v=design.pieces[selected.index];placement(v.x,v.y);}}
$("oe-rotate-left").onclick=()=>rotate(-15);$("oe-rotate-right").onclick=()=>rotate(15);
$("oe-support").onchange=()=>{if(busy||selected?.kind!=="pieces")return;const links=[...$("oe-support").selectedOptions].map(o=>Number(o.value));if(links.length>4){render();return status("Choose at most four supports.");}remember();design.pieces[selected.index].supports=links;render();};
$("oe-orange-support").onchange=()=>{if(busy||selected?.kind!=="oranges")return;remember();design.oranges[selected.index].branch=number("oe-orange-support");render();};
$("oe-delete").onclick=()=>{if(busy||!selected)return;remember();const {kind,index}=selected;design[kind].splice(index,1);if(kind==="pieces"){for(const p of design.pieces)p.supports=p.supports.filter(i=>i!==index).map(i=>i>index?i-1:i);for(const o of design.oranges)o.branch=o.branch===index?-1:o.branch>index?o.branch-1:o.branch;}selected=null;render();};
function history(from,to){if(busy||!from.length)return;readMeta();to.push(clone(design));design=from.pop();selected=null;writeMeta();render();}
$("oe-undo").onclick=()=>history(undo,redo);$("oe-redo").onclick=()=>history(redo,undo);
for(const k of ["title","shots","two","three"])$("oe-"+k).addEventListener("input",persist);
function validated(){readMeta();return validateDesign({...design,gravity:true,pieces:design.pieces.map(p=>({...p,supports:[]})),oranges:design.oranges.map(o=>({...o,branch:-1}))});}
function loadDesign(d,newId=null,officialLevel=null){design={...validateDesign(d),gravity:true};id=newId;editingOfficial=officialLevel;selected=null;undo=[];redo=[];writeMeta();if(editingOfficial)$("oe-level").value=editingOfficial;render();$("oe-id").value=id||"";status("Level loaded.");}
$("oe-new").onclick=()=>{if(busy||!confirm("Start a new level? Unsaved changes will be replaced."))return;design=blank();id=null;editingOfficial=null;selected=null;undo=[];redo=[];writeMeta();render();$("oe-id").value="";$("oe-share").textContent="";};
$("oe-test").onclick=()=>{if(busy)return;try{const d=validated();persist();sessionStorage.setItem("ptg-orange-test",JSON.stringify(d));location.href="orange-knock-down.html?test=1";}catch(e){status(e.message);}};
async function perform(fn){if(busy)return;busy=true;try{await fn();}catch(e){status(e.message);}finally{busy=false;render();}}
function save(copy=false){return perform(async()=>{const d=validated();const result=await editorRequest("save",{id:copy?undefined:id||undefined,design:d},true);id=result.id;editingOfficial=null;$("oe-id").value=id;const link=new URL(location.href);link.search="";link.searchParams.set("level",id);$("oe-share").textContent="Share this link: "+link.href;status("Community level saved.");});}
$("oe-save").onclick=()=>save();$("oe-copy").onclick=()=>save(true);
$("oe-load").onclick=()=>perform(async()=>{const r=await editorRequest("load",{id:$("oe-id").value.trim()});loadDesign(r.design,r.id);});
$("oe-remove").onclick=()=>perform(async()=>{if(!id||!confirm("Delete this community level?"))return;await editorRequest("delete",{id},true);id=null;$("oe-id").value="";$("oe-share").textContent="";status("Community level removed.");});
async function browse(reset){if(reset){cursor=null;$("oe-list").replaceChildren();}const r=await editorRequest("browse",{cursor});cursor=r.cursor;for(const item of r.levels){const b=document.createElement("button");b.textContent=item.title;b.onclick=()=>perform(async()=>{const d=await editorRequest("load",{id:item.id});loadDesign(d.design,d.id);});$("oe-list").append(b);}$("oe-more").hidden=!cursor;status(r.levels.length?"Community levels loaded.":"No more levels.");}
$("oe-browse").onclick=()=>perform(()=>browse(true));$("oe-more").onclick=()=>perform(()=>browse(false));
function openOfficial(level){return perform(async()=>{if(!staff)throw Error("Staff only.");const r=await editorRequest("official",{level});$("oe-level").value=level;loadDesign(r.design,null,level);status("Editing official level "+level+(r.builtIn?" (starter design).":" (published design)."));});}
$("oe-official-load").onclick=()=>openOfficial(number("oe-level"));
for(const b of document.querySelectorAll("[data-oe-official]"))b.onclick=()=>openOfficial(Number(b.dataset.oeOfficial));
$("oe-publish").onclick=()=>perform(async()=>{if(!staff)throw Error("Staff only.");const level=number("oe-level"),d=validated();if(!confirm("Save official level "+level+"? Future attempts entering this level will use this layout."))return;await editorRequest("publish",{level,design:d},true);editingOfficial=level;id=null;$("oe-id").value="";status("Official level "+level+" saved.");});
onAuthStateChanged(auth,async user=>{staff=false;$("oe-official").hidden=true;if(!user||usingLocalFirebaseEmulators)return;try{const s=await getDocFromServer(doc(db,"users",user.uid));if(auth.currentUser?.uid!==user.uid)return;const a=s.data();staff=!!a&&["owner","admin"].includes(a.role)&&(a.status||"active")==="active";$("oe-official").hidden=!staff;if(staff&&new URLSearchParams(location.search).has("official"))$("oe-official").scrollIntoView({block:"nearest"});}catch{}});
try{const saved=JSON.parse(localStorage.getItem(draftKey)||"null");if(saved?.design&&Array.isArray(saved.design.pieces)&&Array.isArray(saved.design.oranges)){design={...saved.design,gravity:true};id=saved.id||null;editingOfficial=Number.isInteger(saved.editingOfficial)?saved.editingOfficial:null;}}catch{}
writeMeta();render();$("oe-id").value=id||"";const shared=new URLSearchParams(location.search).get("level");if(shared){$("oe-id").value=shared;void perform(async()=>{const r=await editorRequest("load",{id:shared});loadDesign(r.design,r.id);});}
