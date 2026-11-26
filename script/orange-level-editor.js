
import {auth,db,usingLocalFirebaseEmulators} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {doc,getDocFromServer} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {WIDTH,HEIGHT,GROUND,SLING,MATERIALS,EDIT_GRID,MAX_PIECES,MAX_ORANGES,validateDesign} from "./orange-knock-down-core.mjs";
import {editorRequest} from "./orange-editor-api.js";
const $=id=>document.getElementById(id),grid=$("oe-grid"),status=m=>$("oe-status").textContent=m,ns="http://www.w3.org/2000/svg";
const blank=()=>({title:"My orchard",shots:5,two:1,three:3,pieces:[],oranges:[]});
let design=blank(),selected=null,id=null,staff=false,busy=false,cursor=null,undo=[],redo=[];
const draftKey="ptg-orange-editor-draft-v1";
const clone=x=>JSON.parse(JSON.stringify(x)),number=id=>Number($(id).value),snap=(v,lo,hi)=>Math.max(lo,Math.min(hi,Math.round(v/EDIT_GRID)*EDIT_GRID));
function option(parent,value,label){const o=document.createElement("option");o.value=value;o.textContent=label;parent.append(o);return o;}
for(const [id,label] of [["select","Select / move"],["orange","Orange"],...Object.entries(MATERIALS).map(([k,m])=>[k,m.label])])option($("oe-tool"),id,label);
$("oe-tool").value="wood";
function readMeta(){design.title=$("oe-title").value;design.shots=number("oe-shots");design.two=number("oe-two");design.three=number("oe-three");}
function writeMeta(){for(const k of ["title","shots","two","three"])$("oe-"+k).value=design[k];}
function remember(){readMeta();undo.push(clone(design));if(undo.length>60)undo.shift();redo=[];}
function persist(){readMeta();try{localStorage.setItem(draftKey,JSON.stringify({design,id}));}catch{}}
function svg(tag,attrs,parent=grid){const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));parent.append(e);return e;}
function render(){
 grid.replaceChildren();svg("rect",{width:WIDTH,height:HEIGHT,fill:"#d5e9e6"});svg("rect",{x:0,y:GROUND,width:WIDTH,height:HEIGHT-GROUND,fill:"#77a45d"});svg("rect",{x:0,y:0,width:160,height:GROUND,fill:"#b4c8cb",opacity:.65});
 for(let x=160;x<=WIDTH;x+=EDIT_GRID)svg("line",{x1:x,y1:0,x2:x,y2:GROUND,stroke:"#aac5c0","stroke-width":.7});
 for(let y=0;y<GROUND;y+=EDIT_GRID)svg("line",{x1:160,y1:y,x2:WIDTH,y2:y,stroke:"#aac5c0","stroke-width":.7});
 svg("path",{d:"M98 502V368M98 502L132 368",stroke:"#895937","stroke-width":10,fill:"none"});svg("circle",{cx:SLING.x,cy:SLING.y,r:15,fill:"#ffa9c3"});
 design.pieces.forEach((p,i)=>{const m=MATERIALS[p.material];if(!m)return;const g=svg("g",{transform:"translate("+p.x+" "+p.y+") rotate("+p.angle+")","data-kind":"pieces","data-index":i});svg("rect",{x:-p.length/2,y:-m.width/2,width:p.length,height:m.width,rx:2,fill:m.color,stroke:selected?.kind==="pieces"&&selected.index===i?"#ffef71":m.edge,"stroke-width":selected?.kind==="pieces"&&selected.index===i?5:2},g);const txt=svg("text",{x:0,y:4,"text-anchor":"middle","font-size":12,fill:"#292725","pointer-events":"none"},g);txt.textContent=i+1;});
 design.oranges.forEach((o,i)=>{const g=svg("g",{"data-kind":"oranges","data-index":i});svg("circle",{cx:o.x,cy:o.y,r:14,fill:"#f6a12d",stroke:selected?.kind==="oranges"&&selected.index===i?"#fff47f":"#bb6b21","stroke-width":selected?.kind==="oranges"&&selected.index===i?5:2},g);svg("ellipse",{cx:o.x+6,cy:o.y-14,rx:7,ry:3,fill:"#57914b"},g);});
 if(selected){const q=design[selected.kind][selected.index];if(q){const links=selected.kind==="pieces"?q.supports:q.branch>=0?[q.branch]:[];for(const i of links){const t=design.pieces[i];if(t)svg("line",{x1:q.x,y1:q.y,x2:t.x,y2:t.y,stroke:"#9c389c","stroke-width":2,"stroke-dasharray":"4 4","pointer-events":"none"});}}}
 $("oe-count").textContent=design.pieces.length+" / "+MAX_PIECES+" pieces · "+design.oranges.length+" / "+MAX_ORANGES+" oranges";
 const s=$("oe-selection");s.replaceChildren();option(s,"","None");for(const [kind,items] of [["pieces",design.pieces],["oranges",design.oranges]])items.forEach((v,i)=>option(s,kind+":"+i,kind==="pieces"?String(i+1)+". "+MATERIALS[v.material].label:"Orange "+(i+1)));s.value=selected?selected.kind+":"+selected.index:"";
 const supp=$("oe-support"),os=$("oe-orange-support");supp.replaceChildren();os.replaceChildren();option(os,-1,"None / independent");const q=selected?design[selected.kind][selected.index]:null;
 design.pieces.forEach((v,i)=>{if(selected?.kind!=="pieces"||selected.index!==i){const o=option(supp,i,"Piece "+(i+1));o.selected=!!q?.supports?.includes(i);}option(os,i,"Piece "+(i+1));});os.value=String(q?.branch??-1);
 supp.disabled=selected?.kind!=="pieces";os.disabled=selected?.kind!=="oranges";$("oe-delete").disabled=!selected;$("oe-undo").disabled=!undo.length;$("oe-redo").disabled=!redo.length;$("oe-remove").disabled=!id||busy;
 persist();
}
function select(kind,index){selected=kind?{kind,index}:null;if(selected){const q=design[kind][index];$("oe-x").value=q.x;$("oe-y").value=q.y;if(kind==="pieces"){$("oe-angle").value=q.angle;$("oe-length").value=q.length;}}render();}
function placement(x,y){
 if(busy)return;
 const tool=$("oe-tool").value,xx=snap(x,180,940),yy=snap(y,20,480);$("oe-x").value=xx;$("oe-y").value=yy;
 if(tool==="select"&&!selected){status("Select an existing piece first.");return;}
 remember();
 if(tool==="select"){const q=design[selected.kind][selected.index];q.x=xx;q.y=yy;if(selected.kind==="pieces"){q.angle=((number("oe-angle")%360)+360)%360;q.length=snap(number("oe-length"),20,240);}}
 else if(tool==="orange"){if(design.oranges.length>=MAX_ORANGES){undo.pop();return status("Orange limit reached.");}design.oranges.push({x:xx,y:yy,branch:-1});selected={kind:"oranges",index:design.oranges.length-1};}
 else{if(design.pieces.length>=MAX_PIECES){undo.pop();return status("Piece limit reached.");}design.pieces.push({material:tool,x:xx,y:yy,angle:((number("oe-angle")%360)+360)%360,length:snap(number("oe-length"),20,240),supports:[]});selected={kind:"pieces",index:design.pieces.length-1};}
 render();
}
grid.addEventListener("click",e=>{if(busy)return;const p=grid.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const q=p.matrixTransform(grid.getScreenCTM().inverse());if($("oe-tool").value==="select"){const hit=e.target.closest("[data-kind]");if(hit){select(hit.dataset.kind,Number(hit.dataset.index));return;}}if(q.x>=160&&q.y>=0&&q.y<GROUND)placement(q.x,q.y);});
$("oe-selection").onchange=()=>{const [kind,i]=$("oe-selection").value.split(":");$("oe-tool").value="select";select(kind||null,Number(i));};
$("oe-place").onclick=()=>placement(number("oe-x"),number("oe-y"));
function rotate(delta){if(busy)return;const a=((number("oe-angle")+delta)%360+360)%360;$("oe-angle").value=a;if(selected?.kind==="pieces"&&$("oe-tool").value==="select"){remember();design.pieces[selected.index].angle=a;render();}}
$("oe-rotate-left").onclick=()=>rotate(-15);$("oe-rotate-right").onclick=()=>rotate(15);
$("oe-support").onchange=()=>{if(busy||selected?.kind!=="pieces")return;const links=[...$("oe-support").selectedOptions].map(o=>Number(o.value));if(links.length>4){render();return status("Choose at most four supports.");}remember();design.pieces[selected.index].supports=links;render();};
$("oe-orange-support").onchange=()=>{if(busy||selected?.kind!=="oranges")return;remember();design.oranges[selected.index].branch=number("oe-orange-support");render();};
$("oe-delete").onclick=()=>{if(busy||!selected)return;remember();const {kind,index}=selected;design[kind].splice(index,1);if(kind==="pieces"){for(const p of design.pieces)p.supports=p.supports.filter(i=>i!==index).map(i=>i>index?i-1:i);for(const o of design.oranges)o.branch=o.branch===index?-1:o.branch>index?o.branch-1:o.branch;}selected=null;render();};
function history(from,to){if(busy||!from.length)return;readMeta();to.push(clone(design));design=from.pop();selected=null;writeMeta();render();}
$("oe-undo").onclick=()=>history(undo,redo);$("oe-redo").onclick=()=>history(redo,undo);
for(const k of ["title","shots","two","three"])$("oe-"+k).addEventListener("input",persist);
function validated(){readMeta();return validateDesign(design);}
function loadDesign(d,newId=null){design=validateDesign(d);id=newId;selected=null;undo=[];redo=[];writeMeta();render();$("oe-id").value=id||"";status("Level loaded.");}
$("oe-new").onclick=()=>{if(busy||!confirm("Start a new level? Unsaved changes will be replaced."))return;design=blank();id=null;selected=null;undo=[];redo=[];writeMeta();render();$("oe-id").value="";$("oe-share").textContent="";};
$("oe-test").onclick=()=>{if(busy)return;try{const d=validated();persist();sessionStorage.setItem("ptg-orange-test",JSON.stringify(d));location.href="orange-knock-down.html?test=1";}catch(e){status(e.message);}};
async function perform(fn){if(busy)return;busy=true;try{await fn();}catch(e){status(e.message);}finally{busy=false;render();}}
function save(copy=false){return perform(async()=>{const d=validated();const result=await editorRequest("save",{id:copy?undefined:id||undefined,design:d},true);id=result.id;$("oe-id").value=id;const link=new URL(location.href);link.search="";link.searchParams.set("level",id);$("oe-share").textContent="Share this link: "+link.href;status("Community level saved.");});}
$("oe-save").onclick=()=>save();$("oe-copy").onclick=()=>save(true);
$("oe-load").onclick=()=>perform(async()=>{const r=await editorRequest("load",{id:$("oe-id").value.trim()});loadDesign(r.design,r.id);});
$("oe-remove").onclick=()=>perform(async()=>{if(!id||!confirm("Delete this community level?"))return;await editorRequest("delete",{id},true);id=null;$("oe-id").value="";$("oe-share").textContent="";status("Community level removed.");});
async function browse(reset){if(reset){cursor=null;$("oe-list").replaceChildren();}const r=await editorRequest("browse",{cursor});cursor=r.cursor;for(const item of r.levels){const b=document.createElement("button");b.textContent=item.title;b.onclick=()=>perform(async()=>{const d=await editorRequest("load",{id:item.id});loadDesign(d.design,d.id);});$("oe-list").append(b);}$("oe-more").hidden=!cursor;status(r.levels.length?"Community levels loaded.":"No more levels.");}
$("oe-browse").onclick=()=>perform(()=>browse(true));$("oe-more").onclick=()=>perform(()=>browse(false));
$("oe-official-load").onclick=()=>perform(async()=>{if(!staff)throw Error("Staff only.");const r=await editorRequest("official",{level:number("oe-level")});loadDesign(r.design);});
$("oe-publish").onclick=()=>perform(async()=>{if(!staff)throw Error("Staff only.");const level=number("oe-level"),d=validated();if(!confirm("Publish official level "+level+"? Future attempts entering this level will use this layout."))return;await editorRequest("publish",{level,design:d},true);status("Official level "+level+" published.");});
onAuthStateChanged(auth,async user=>{staff=false;$("oe-official").hidden=true;if(!user||usingLocalFirebaseEmulators)return;try{const s=await getDocFromServer(doc(db,"users",user.uid));if(auth.currentUser?.uid!==user.uid)return;const a=s.data();staff=!!a&&["owner","admin"].includes(a.role)&&(a.status||"active")==="active";$("oe-official").hidden=!staff;if(staff&&new URLSearchParams(location.search).has("official"))$("oe-official").scrollIntoView({block:"nearest"});}catch{}});
try{const saved=JSON.parse(localStorage.getItem(draftKey)||"null");if(saved?.design&&Array.isArray(saved.design.pieces)&&Array.isArray(saved.design.oranges)){design=saved.design;id=saved.id||null;}}catch{}
writeMeta();render();$("oe-id").value=id||"";const shared=new URLSearchParams(location.search).get("level");if(shared){$("oe-id").value=shared;void perform(async()=>{const r=await editorRequest("load",{id:shared});loadDesign(r.design,r.id);});}
