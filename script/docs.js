// PrincessTG Docs: Firebase-backed document library and account-scoped local backups.
import {auth,db as firestore} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {listCloud,loadCloud,saveCloud,deleteCloud} from "./docs-cloud.js";
const $=id=>document.getElementById(id);
const app=$("docs-app"),host=$("doc-pages");
const ns="http://www.w3.org/2000/svg";
const presets={letter:[8.5,11],a4:[8.27,11.69],legal:[8.5,14],a5:[5.83,8.27],half:[5.5,8.5]};
const defaults={paper:"letter",orientation:"portrait",width:8.5,height:11,top:1,bottom:1,left:1,right:1,header:"",footer:"",numbers:false};
const id=()=>crypto.randomUUID?.()||Date.now()+"-"+Math.random().toString(36).slice(2);
const blank=()=>({id:id(),title:"Untitled document",layout:{...defaults},pages:[{html:"<p><br></p>",ink:[]}],updated:Date.now()});
let model=blank(),active=0,range=null,selectedImage=null,drawing=false,eraser=false,saveTimer,backupTimer,dirty=false,zoom=.9;
let uid=null,scope=null,generation=0,revision=0,editVersion=0,ready=false;
let pendingCloud=false,saveQueue=Promise.resolve();
const pages=()=>[...host.querySelectorAll(".doc-page-wrap")];
const editors=()=>[...host.querySelectorAll(".doc-content")];
const editor=()=>editors()[active];
const say=t=>$("doc-status").textContent=t;
const finite=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):fallback;
function safeLayout(value={}){
 const l={...defaults,...value};l.width=finite(l.width,3,24,8.5);l.height=finite(l.height,3,24,11);
 for(const k of ["top","bottom","left","right"])l[k]=finite(l[k],.1,4,1);
 if(l.left+l.right>=l.width-.25){l.left=.25;l.right=.25;}
 if(l.top+l.bottom>=l.height-.25){l.top=.25;l.bottom=.25;}
 l.paper=Object.hasOwn(presets,l.paper)?l.paper:"custom";
 l.orientation=l.width>l.height?"landscape":"portrait";
 l.header=String(l.header||"").slice(0,240);l.footer=String(l.footer||"").slice(0,240);l.numbers=!!l.numbers;return l;
}
// Do not retain scripts, event handlers, embedded frames, network images or unsafe URLs.
const tags=new Set("P DIV SPAN BR B STRONG I EM U S STRIKE DEL SUB SUP H1 H2 H3 H4 H5 H6 BLOCKQUOTE PRE CODE UL OL LI TABLE THEAD TBODY TFOOT TR TD TH HR A IMG FONT".split(" "));
const styles=new Set("font-family font-size font-weight font-style text-decoration text-decoration-line color background-color text-align text-indent line-height margin-left margin-right margin-top margin-bottom padding-left width height max-width vertical-align list-style-type border border-collapse".split(" "));
function safeHref(v){try{const u=new URL(v,location.href);return ["http:","https:","mailto:"].includes(u.protocol)||v.startsWith("#")?v:"";}catch{return "";}}
function safeImage(v){return /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(v)&&v.length<=5_000_000;}
function sanitize(html){
 const doc=new DOMParser().parseFromString(String(html),"text/html"),out=document.createElement("div");
 function visit(n,parent){
  if(n.nodeType===3){parent.append(document.createTextNode(n.data));return;}
  if(n.nodeType!==1)return;
  const tag=n.tagName;
  if(["SCRIPT","STYLE","IFRAME","OBJECT","EMBED","SVG","MATH","VIDEO","AUDIO","LINK","META","FORM","INPUT","BUTTON"].includes(tag))return;
  if(!tags.has(tag)){for(const child of n.childNodes)visit(child,parent);return;}
  const e=document.createElement(tag.toLowerCase());
  if(tag==="IMG"){
   const src=n.getAttribute("src")||"";if(!safeImage(src))return;e.src=src;e.alt=(n.getAttribute("alt")||"Picture").slice(0,200);
  }
  if(tag==="A"){const href=safeHref(n.getAttribute("href")||"");if(href)e.setAttribute("href",href);}
  if(/^H[1-6]$/.test(tag)&&/^doc-heading-[a-z0-9-]+$/i.test(n.id))e.id=n.id;
  if(n.classList.contains("doc-toc")){e.className="doc-toc";e.contentEditable="false";}
  if(tag==="TD"||tag==="TH")for(const key of ["colspan","rowspan"]){const v=Number(n.getAttribute(key));if(Number.isInteger(v)&&v>=1&&v<=30)e.setAttribute(key,v);}
  if(tag==="FONT")for(const key of ["face","size","color"]){const v=n.getAttribute(key);if(v&&v.length<100&&!/[<>{}]/.test(v))e.setAttribute(key,v);}
  for(const key of styles){const value=n.style.getPropertyValue(key);if(value&&value.length<180&&!/url\s*\(|expression|@import|javascript/i.test(value))e.style.setProperty(key,value);}
  for(const child of n.childNodes)visit(child,e);parent.append(e);
 }
 for(const child of doc.body.childNodes)visit(child,out);
 return out.innerHTML;
}
function validInk(list){
 return (Array.isArray(list)?list:[]).slice(0,1500).flatMap(p=>{
  if(!p||typeof p.d!=="string"||p.d.length>100000||!/^[ML0-9., -]+$/.test(p.d))return [];
  return [{d:p.d,color:/^#[0-9a-f]{6}$/i.test(p.color)?p.color:"#eb4a9c",width:finite(p.width,1,30,3)}];
 });
}
function normalize(raw){
 if(!raw||!Array.isArray(raw.pages)||!raw.pages.length||raw.pages.length>300)throw Error("Invalid document file (1–300 pages supported).");
 return {id:typeof raw.id==="string"&&raw.id.length<=100?raw.id:id(),title:String(raw.title||"Untitled document").slice(0,120),layout:safeLayout(raw.layout),pages:raw.pages.map(p=>({html:sanitize(p.html||"<p><br></p>"),ink:validInk(p.ink)})),updated:Number(raw.updated)||Date.now()};
}
function applyLayout(){
 const l=model.layout;
 for(const [k,v] of [["paper-w",l.width],["paper-h",l.height],["mt",l.top],["mb",l.bottom],["ml",l.left],["mr",l.right]])app.style.setProperty("--"+k,v+"in");
 $("doc-print-size").textContent="@page { size: "+l.width+"in "+l.height+"in; margin:0; }";
 for(const [key,v] of Object.entries({paper:l.paper,orientation:l.orientation,width:l.width,height:l.height,"margin-top":l.top,"margin-bottom":l.bottom,"margin-left":l.left,"margin-right":l.right}))$("doc-"+key).value=v;
 for(const wrap of pages()){
  wrap.querySelector(".doc-ink").setAttribute("viewBox","0 0 "+l.width*96+" "+l.height*96);
 }
 updateDecorations();updateInfo();
}
function makePage(data,index){
 const wrap=document.createElement("div");wrap.className="doc-page-wrap";
 const paper=document.createElement("article");paper.className="doc-paper";
 const head=document.createElement("div");head.className="doc-header";
 const foot=document.createElement("div");foot.className="doc-footer";
 const ed=document.createElement("div");ed.className="doc-content";ed.contentEditable="true";ed.setAttribute("role","textbox");ed.setAttribute("aria-multiline","true");ed.spellcheck=true;ed.innerHTML=sanitize(data.html)||"<p><br></p>";
 const ink=document.createElementNS(ns,"svg");ink.classList.add("doc-ink");ink.setAttribute("viewBox","0 0 "+model.layout.width*96+" "+model.layout.height*96);
 for(const p of validInk(data.ink))ink.append(inkPath(p));
 ed.addEventListener("focus",()=>setActive(pages().indexOf(wrap)));
 ed.addEventListener("input",()=>{capture();mark();});
 ed.addEventListener("paste",pasteEvent);
 ed.addEventListener("click",e=>{
  selectedImage?.classList.remove("docs-selected");selectedImage=e.target.tagName==="IMG"?e.target:null;selectedImage?.classList.add("docs-selected");
  if(e.target.closest("a")&&e.ctrlKey){e.preventDefault();const href=e.target.closest("a").getAttribute("href");if(href?.startsWith("#"))document.getElementById(href.slice(1))?.scrollIntoView({block:"center"});}
 });
 ed.addEventListener("dragover",e=>{if([...e.dataTransfer.items].some(i=>i.kind==="file"))e.preventDefault();});
 ed.addEventListener("drop",e=>{if(e.dataTransfer.files.length){e.preventDefault();setActive(pages().indexOf(wrap));range=null;void imageFile(e.dataTransfer.files[0]);}});
 wireInk(ink,wrap);
 paper.append(head,ed,ink,foot);wrap.append(paper);return wrap;
}
function render(){
 host.replaceChildren(...model.pages.map(makePage));active=0;range=null;selectedImage=null;
 $("doc-title").value=model.title;applyLayout();setActive(0);updateInfo();
}
function updateDecorations(){
 pages().forEach((p,i)=>{
  p.querySelector(".doc-content").setAttribute("aria-label","Document page "+(i+1));
  p.querySelector(".doc-header").textContent=model.layout.header;
  p.querySelector(".doc-footer").textContent=[model.layout.footer,model.layout.numbers?String(i+1):""].filter(Boolean).join("   ·   ");
 });
}
function setActive(i){active=Math.max(0,Math.min(pages().length-1,i));pages().forEach((p,n)=>p.dataset.active=String(n===active));updateInfo();}
function go(i,focus=false){setActive(i);pages()[active]?.scrollIntoView({block:"start",behavior:"auto"});if(focus){editor().focus();const r=document.createRange();r.selectNodeContents(editor());r.collapse(true);const sel=getSelection();sel.removeAllRanges();sel.addRange(r);capture();}}
function capture(){const sel=getSelection();if(!sel?.rangeCount)return;const r=sel.getRangeAt(0);const owner=(r.commonAncestorContainer.nodeType===1?r.commonAncestorContainer:r.commonAncestorContainer.parentElement)?.closest(".doc-content");if(owner){active=editors().indexOf(owner);range=r.cloneRange();}}
document.addEventListener("selectionchange",capture);
function restore(){
 const ed=editor();if(!ed)return false;ed.focus();const sel=getSelection();sel.removeAllRanges();
 if(range&&ed.contains(range.commonAncestorContainer))sel.addRange(range);
 else {const r=document.createRange();r.selectNodeContents(ed);r.collapse(false);sel.addRange(r);}
 return true;
}
function cmd(command,value=null){if(!restore())return;document.execCommand("styleWithCSS",false,true);document.execCommand(command,false,value);capture();mark();}
function insert(html){cmd("insertHTML",sanitize(html));}
function node(tag,text){const e=document.createElement(tag);e.textContent=text;return e;}
function headings(){return editors().flatMap((ed,index)=>[...ed.querySelectorAll("h1,h2,h3")].map(h=>({h,index,level:Number(h.tagName[1])})));}
function updateInfo(){
 const list=$("doc-page-list"),outline=$("doc-outline");list.replaceChildren();outline.replaceChildren();
 const wraps=pages();let overflow=0;
 wraps.forEach((p,i)=>{
  const ed=p.querySelector(".doc-content");const over=ed.scrollHeight>ed.clientHeight+3||ed.scrollWidth>ed.clientWidth+3;p.dataset.overflow=String(over);if(over)overflow++;
  const b=node("button","Page "+(i+1));b.setAttribute("aria-current",String(i===active));b.onclick=()=>go(i,true);list.append(b);
 });
 for(const {h,index,level} of headings()){const b=node("button",h.textContent.trim().slice(0,90)||"(Untitled heading)");b.dataset.level=level;b.onclick=()=>{go(index);h.scrollIntoView({block:"center"});};outline.append(b);}
 $("doc-page-status").textContent="Page "+(active+1)+" of "+wraps.length;
 const words=editors().map(e=>e.innerText).join(" ").trim().split(/\s+/).filter(Boolean).length;$("doc-word-count").textContent=words.toLocaleString()+" words";
 $("doc-overflow").textContent=overflow?overflow+" page(s) overflow. Insert a page break or move text before printing.":"";
}
function collect(){
 model.title=$("doc-title").value.trim()||"Untitled document";
 model.pages=pages().map(w=>({html:sanitize(w.querySelector(".doc-content").innerHTML),
  ink:[...w.querySelectorAll(".doc-ink path")].map(p=>({d:p.getAttribute("d"),color:p.getAttribute("stroke"),width:Number(p.getAttribute("stroke-width"))}))}));
 model.updated=Date.now();return model;
}
function mark(){
 if(!ready)return;
 dirty=true;pendingCloud=!!uid;editVersion++;updateInfo();
 say(uid?"Editing · local backup and cloud autosave pending":"Editing · guest local autosave pending");
 clearTimeout(backupTimer);clearTimeout(saveTimer);
 backupTimer=setTimeout(()=>void backupOnly(),650);
 saveTimer=setTimeout(()=>void save(),uid?12000:1200);
}
function addPage(at=pages().length,data={html:"<p><br></p>",ink:[]}){
 if(pages().length>=300){say("Maximum of 300 pages per document.");return;}
 const p=makePage(data,at);host.insertBefore(p,pages()[at]||null);updateDecorations();go(at,true);mark();
}
function breakPage(){
 if(pages().length>=300){say("Maximum of 300 pages reached.");return;}
 if(!restore())return;const ed=editor(),i=active,sel=getSelection(),r=sel.getRangeAt(0).cloneRange();r.collapse(false);
 r.setEnd(ed,ed.childNodes.length);const frag=r.extractContents(),holder=document.createElement("div");holder.append(frag);
 if(!ed.innerHTML.trim())ed.innerHTML="<p><br></p>";
 addPage(i+1,{html:holder.innerHTML||"<p><br></p>",ink:[]});
}
// Keep a sheet fixed at its chosen dimensions. Flow only real overflow,
// and preserve the DOM fragments/formatting instead of rebuilding plain text.
// A table or picture taller than the whole printable area needs resizing.
function flowOverflow(){
 let moved=0,blocked=0;
 for(let i=0;i<pages().length&&pages().length<300;i++){
  const ed=editors()[i];ed.scrollTop=0;
  if(ed.scrollHeight<=ed.clientHeight+3)continue;
  const bottom=ed.getBoundingClientRect().bottom-2;
  let split=null,offset=0;
  for(const child of [...ed.childNodes]){
   const bounds=document.createRange();bounds.selectNode(child);
   if(bounds.getBoundingClientRect().bottom<=bottom)continue;
   if(child.nodeType===1&&["TABLE","IMG","UL","OL"].includes(child.tagName)){
    if(child===ed.firstChild){blocked++;break;}
    split=child;offset=-1;break;
   }
   const walker=document.createTreeWalker(child,NodeFilter.SHOW_TEXT);
   const runs=child.nodeType===3?[child]:[];let run;
   while(run=walker.nextNode())runs.push(run);
   for(const text of runs){
    if(!text.length)continue;
    const all=document.createRange();all.selectNodeContents(text);
    if(all.getBoundingClientRect().bottom<=bottom)continue;
    let lo=0,hi=text.length;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);const r=document.createRange();r.setStart(text,mid-1);r.setEnd(text,mid);if(r.getBoundingClientRect().bottom<=bottom)lo=mid;else hi=mid-1;}
    split=text;offset=lo;break;
   }
   if(!split&&child!==ed.firstChild){split=child;offset=-1;}
   if(!split)blocked++;
   break;
  }
  if(!split)continue;
  const r=document.createRange();
  if(offset<0)r.setStartBefore(split);else r.setStart(split,offset);
  r.setEnd(ed,ed.childNodes.length);
  const clone=r.cloneContents(),holder=document.createElement("div");holder.append(clone);
  // If every character would move, the object itself is too tall.
  if(!holder.innerHTML||holder.innerHTML===ed.innerHTML){blocked++;continue;}
  r.deleteContents();
  const newPage=makePage({html:holder.innerHTML,ink:[]},i+1);
  host.insertBefore(newPage,pages()[i+1]||null);moved++;
 }
 range=null;updateDecorations();mark();
 say(moved+" new page(s) created."+(blocked?" Some oversized objects still need resizing.":""));
}
function removePage(){if(!confirm("Remove the current page and its content?"))return;if(pages().length===1){editor().innerHTML="<p><br></p>";pages()[0].querySelector(".doc-ink").replaceChildren();}else pages()[active].remove();range=null;setActive(Math.max(0,active-1));updateDecorations();mark();}
function blockStyle(property,value){
 if(!restore())return;const r=getSelection().getRangeAt(0),ed=editor();let targets=[...ed.querySelectorAll("p,div,h1,h2,h3,h4,li,blockquote,pre")].filter(x=>!x.closest(".doc-toc")&&r.intersectsNode(x)&&!x.querySelector("p,div,h1,h2,h3,h4,li,blockquote,pre"));
 if(!targets.length){let e=r.startContainer.nodeType===1?r.startContainer:r.startContainer.parentElement;if(e===ed){document.execCommand("formatBlock",false,"p");e=getSelection().anchorNode?.parentElement;}const b=e?.closest("p,div,h1,h2,h3,h4,li,blockquote,pre");if(b&&b!==ed)targets=[b];}
 targets.forEach(x=>x.style.setProperty(property,value));mark();
}
function fontSize(pt){
 if(!restore())return;document.execCommand("styleWithCSS",false,false);document.execCommand("fontSize",false,"7");
 for(const f of editor().querySelectorAll('font[size="7"]')){f.removeAttribute("size");f.style.fontSize=pt+"pt";}
 document.execCommand("styleWithCSS",false,true);capture();mark();
}
async function imageFile(file){
 if(!file||!["image/png","image/jpeg","image/webp","image/gif"].includes(file.type)||file.size>3_500_000){say("Choose a PNG, JPG, GIF or WebP image under 3.5 MB.");return;}
 const reader=new FileReader();reader.onload=()=>{if(!safeImage(reader.result))return;const img=document.createElement("img");img.src=reader.result;img.alt=file.name||"Pasted image";img.style.width="100%";insert(img.outerHTML);};reader.onerror=()=>say("Could not read the picture.");reader.readAsDataURL(file);
}
function pasteEvent(e){
 e.preventDefault();capture();const files=[...(e.clipboardData?.files||[])];if(files.length){void imageFile(files[0]);return;}
 const html=e.clipboardData?.getData("text/html"),plain=e.clipboardData?.getData("text/plain")||"";
 if(html)insert(html);else cmd("insertText",plain);
}
function insertTable(){
 const rows=Number(prompt("How many rows? (1–30)","3")),cols=Number(prompt("How many columns? (1–15)","3"));
 if(!Number.isInteger(rows)||!Number.isInteger(cols)||rows<1||rows>30||cols<1||cols>15)return;
 insert("<table><tbody>"+Array.from({length:rows},()=>"<tr>"+"<td><br></td>".repeat(cols)+"</tr>").join("")+"</tbody></table><p><br></p>");
}
function toc(refresh=false){
 const content=headings();if(!content.length){say("Add Heading 1, 2 or 3 first.");return;}
 const div=document.createElement("div");div.className="doc-toc";div.contentEditable="false";div.append(node("p","Table of contents"));
 for(const {h,index,level} of content){
  if(!h.id)h.id="doc-heading-"+id();const p=document.createElement("p");p.style.marginLeft=(level-1)*.2+"in";const a=node("a",h.textContent.trim()+" · "+(index+1));a.href="#"+h.id;p.append(a);div.append(p);
 }
 const existing=host.querySelector(".doc-toc");if(refresh&&existing){existing.replaceWith(div);mark();}else insert(div.outerHTML+"<p><br></p>");
}
function inkPath(p){const e=document.createElementNS(ns,"path");e.setAttribute("d",p.d);e.setAttribute("stroke",p.color);e.setAttribute("stroke-width",p.width);e.setAttribute("fill","none");e.setAttribute("stroke-linecap","round");e.setAttribute("stroke-linejoin","round");return e;}
function wireInk(svg,wrap){
 let path=null;
 const point=e=>{const b=svg.getBoundingClientRect();return [(e.clientX-b.left)*model.layout.width*96/b.width,(e.clientY-b.top)*model.layout.height*96/b.height].map(v=>v.toFixed(1)).join(",");};
 svg.addEventListener("pointerdown",e=>{if(!drawing)return;e.preventDefault();setActive(pages().indexOf(wrap));
  if(eraser){if(e.target.tagName.toLowerCase()==="path"){e.target.remove();mark();}return;}
  svg.setPointerCapture(e.pointerId);const p=point(e);path=inkPath({d:"M"+p+" L"+p,color:$("doc-ink").value,width:finite($("doc-ink-width").value,1,30,3)});svg.append(path);
 });
 svg.addEventListener("pointermove",e=>{if(path)path.setAttribute("d",path.getAttribute("d")+" L"+point(e));});
 const stop=()=>{if(path){path=null;mark();}};svg.addEventListener("pointerup",stop);svg.addEventListener("pointercancel",stop);
}
function toggleDraw(on){drawing=on;app.dataset.drawing=String(on);$("doc-draw-toggle").textContent=on?"Finish drawing":"Start drawing";$("doc-draw-toggle").setAttribute("aria-pressed",String(on));if(!on){eraser=false;$("doc-erase").setAttribute("aria-pressed","false");}}
// Local backups use a separate account/project scoped store. The old
// unscoped guest library is not uploaded or exposed to signed-in accounts.
const dbReady=new Promise((resolve,reject)=>{
 const request=indexedDB.open("PrincessTGDocs",2);
 request.onupgradeneeded=()=>{
  if(!request.result.objectStoreNames.contains("documents"))request.result.createObjectStore("documents",{keyPath:"id"});
  if(!request.result.objectStoreNames.contains("scopedDocuments")){
   const store=request.result.createObjectStore("scopedDocuments",{keyPath:"key"});store.createIndex("scope","scope");
  }
 };
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
dbReady.catch(()=>{});
async function dbOp(mode,operation,storeName="scopedDocuments"){
 const db=await dbReady;return new Promise((resolve,reject)=>{
  const tx=db.transaction(storeName,mode),req=operation(tx.objectStore(storeName));let value;
  req.onsuccess=()=>value=req.result;tx.oncomplete=()=>resolve(value);
  tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
const scopeFor=user=>firestore.app.options.projectId+"|"+(user?.uid||"guest");
const localKey=(scope,id)=>scope+"|"+id;
const lastKey=scope=>"ptg-doc-last|"+scope;
function remember(scope,id){try{localStorage.setItem(lastKey(scope),id);}catch{}}
function lastId(scope){try{return localStorage.getItem(lastKey(scope));}catch{return null;}}
async function cache(value,owner,rev,pending){
 await dbOp("readwrite",store=>store.put({key:localKey(owner,value.id),scope:owner,id:value.id,value,revision:rev,pending}));
 remember(owner,value.id);
}
const ownBackup=(owner,id)=>dbOp("readonly",store=>store.get(localKey(owner,id)));
const ownBackups=owner=>dbOp("readonly",store=>store.index("scope").getAll(owner));
function snapshot(){
 return {value:structuredClone(collect()),scope,uid,revision,version:editVersion,generation,pending:pendingCloud};
}
function stillCurrent(s){return s.generation===generation&&s.scope===scope&&s.value.id===model.id;}
async function backupOnly(){
 if(!ready||!scope)return false;
 const s=snapshot();
 try{await cache(s.value,s.scope,s.revision,s.pending);if(stillCurrent(s)&&s.version===editVersion&&!uid){dirty=false;say("Saved locally · sign in for cloud documents");}return true;}
 catch(e){if(stillCurrent(s))say("Local backup failed: "+e.message);return false;}
}
async function save(){
 clearTimeout(saveTimer);clearTimeout(backupTimer);
 if(!ready||!scope)return false;
 // Queue saves, and capture the latest revision after any preceding save.
 const token=generation,docId=model.id;
 const task=async()=>{
  if(!ready||token!==generation||model.id!==docId)return false;
  const s=snapshot();
  let localOK=false;
  try{await cache(s.value,s.scope,s.revision,s.pending);localOK=true;}catch{}
  if(!stillCurrent(s))return localOK;
  if(!s.uid){
   if(s.version===editVersion){dirty=!localOK;say(localOK?"Saved locally · sign in for cloud documents":"Local save failed. Download an editable backup.");}
   return localOK;
  }
  if(auth.currentUser?.uid!==s.uid)return localOK;
  if(!s.pending&&s.revision>0){
   if(s.version===editVersion){dirty=false;say("Saved to Firebase · cloud document up to date");}
   return true;
  }
  say("Saving document to Firebase…");
  try{
   const rev=await saveCloud(s.uid,s.value,s.revision);
   if(!stillCurrent(s))return true;
   revision=rev;
   const newer=s.version!==editVersion;
   // Preserve edits made while the network request was running.
   const value=newer?structuredClone(collect()):s.value;
   pendingCloud=newer;dirty=newer;
   try{await cache(value,s.scope,rev,newer);}catch{}
   if(stillCurrent(s)&&!newer)say("Saved to Firebase · "+new Date().toLocaleTimeString());
   else if(stillCurrent(s))say("New edits pending cloud autosave");
   return true;
  }catch(e){
   if(stillCurrent(s)){
    pendingCloud=true;dirty=!localOK;
    say((localOK?"Local backup saved; Firebase not saved. ":"Save failed. Download an editable backup. ")+e.message);
   }
   return false;
  }
 };
 const result=saveQueue.then(task,task);saveQueue=result.catch(()=>{});return result;
}
function openValue(value,rev=0,pending=false){
 model=normalize(value);revision=rev;pendingCloud=pending;dirty=false;editVersion++;
 toggleDraw(false);render();remember(scope,model.id);
}
async function switchDoc(value,rev=0,pending=false){
 const token=generation;
 if((dirty||pendingCloud)&&!(await save())&&!confirm("Firebase save did not finish. Your local backup may contain unsynced edits. Switch anyway?"))return;
 if(token!==generation)return;
 clearTimeout(saveTimer);clearTimeout(backupTimer);openValue(value,rev,pending);
 if(rev===0||pending){pendingCloud=!!uid;dirty=true;await save();}
 else say("Opened "+model.title+" from Firebase");
}
async function library(){
 if(!ready)return;
 const token=generation,owner=scope,ownerUid=uid;
 const list=$("doc-library-list");list.replaceChildren(node("p","Loading documents…"));$("doc-library-dialog").showModal();
 let cloud=[],local=[],errors=[];
 try{local=await ownBackups(owner);}catch(e){errors.push("Local backups unavailable: "+e.message);}
 if(ownerUid){try{cloud=await listCloud(ownerUid);}catch(e){errors.push("Firebase library unavailable: "+e.message);}}
 else {
  // Existing pre-Firebase guest documents remain available only in guest mode.
  try{const old=await dbOp("readonly",s=>s.getAll(),"documents");for(const value of old)if(!local.some(x=>x.id===value.id))local.push({id:value.id,value,revision:0,pending:false,legacy:true});}catch{}
 }
 if(token!==generation)return;
 list.replaceChildren();
 for(const error of errors)list.append(node("p",error));
 function row(title,subtitle,openAction,deleteAction,copyAction){
  const row=document.createElement("div");row.className="docs-library-row";
  const info=document.createElement("div");info.append(node("strong",title),node("small",subtitle));
  const open=node("button","Open");open.onclick=async()=>{try{if(token!==generation)return;await openAction();}catch(e){say("Cannot open: "+e.message);alert(e.message);}};
  row.append(info,open);
  if(copyAction){const copy=node("button","Recover copy");copy.onclick=async()=>{try{await copyAction();}catch(e){alert(e.message);}};row.append(copy);}
  if(deleteAction){const del=node("button","Delete");del.onclick=async()=>{try{if(token!==generation)return;await deleteAction();row.remove();}catch(e){alert(e.message);}};row.append(del);}
  list.append(row);
 }
 const byId=new Map(local.map(r=>[r.id,r]));
 const cloudIds=new Set(cloud.map(r=>r.id));
 cloud.sort((a,b)=>(b.updatedAt?.toMillis?.()||0)-(a.updatedAt?.toMillis?.()||0));
 for(const item of cloud){
  const backup=byId.get(item.id);
  row(item.title||"Untitled document",(item.pageCount||0)+" page(s) · Firebase"+(backup?.pending?" · unsynced local edits":""),async()=>{
   const result=await loadCloud(ownerUid,item.id);if(token!==generation)return;
   if(!result)throw Error("Cloud document no longer exists.");
   if(backup?.pending&&!confirm("Open the cloud version? Unsynced local edits are available through Recover copy."))return;
   if(item.id===model.id&&(dirty||pendingCloud)){if(!confirm("Replace the current view with the saved cloud version? Export a backup first if needed."))return;clearTimeout(saveTimer);clearTimeout(backupTimer);await backupOnly();pendingCloud=false;dirty=false;}
   $("doc-library-dialog").close();await switchDoc(result.value,result.revision,false);
  },async()=>{
   if(item.id===model.id)throw Error("Open another document before deleting this one.");
   if(!confirm("Permanently delete "+item.title+" from Firebase and this device's backup?"))throw Error("Deletion canceled.");
   await deleteCloud(ownerUid,item.id,item.revision);
   await dbOp("readwrite",s=>s.delete(localKey(owner,item.id))).catch(()=>{});
  },backup?.pending?async()=>{
   if(token!==generation)return;const value=structuredClone(backup.value);value.id=id();value.title=(value.title+" (recovered copy)").slice(0,120);
   $("doc-library-dialog").close();await switchDoc(value,0,true);
  }:null);
 }
 for(const r of local.filter(x=>!cloudIds.has(x.id)).sort((a,b)=>b.value.updated-a.value.updated)){
  row(r.value.title,r.value.pages.length+" page(s) · "+(ownerUid?"Local backup / not listed in Firebase":"Guest local document"),async()=>{
   $("doc-library-dialog").close();await switchDoc(r.value,r.revision,!!ownerUid);
  },async()=>{
   if(r.id===model.id)throw Error("Open another document before deleting this one.");
   if(!confirm("Delete this local backup?"))throw Error("Deletion canceled.");
   if(r.legacy)await dbOp("readwrite",s=>s.delete(r.id),"documents");
   else await dbOp("readwrite",s=>s.delete(localKey(owner,r.id)));
  });
 }
 if(!cloud.length&&!local.length&&!errors.length)list.append(node("p","No saved documents yet."));
}
async function initializeAccount(user){
 const nextScope=scopeFor(user);
 if(ready&&scope===nextScope)return;
 // Capture outgoing edits before hiding the workspace. Never upload a
 // document to another user's account during authentication changes.
 if(ready&&scope&&(dirty||pendingCloud)){
  const old=snapshot();void cache(old.value,old.scope,old.revision,old.pending).catch(()=>{});
 }
 const token=++generation;clearTimeout(saveTimer);clearTimeout(backupTimer);
 ready=false;scope=nextScope;uid=user?.uid||null;dirty=false;pendingCloud=false;revision=0;
 if($("doc-library-dialog").open)$("doc-library-dialog").close();
 host.replaceChildren();$("doc-title").value="";app.inert=true;
 say("Loading your "+(uid?"Firebase":"guest")+" workspace…");
 let backup=null;
 try{const last=lastId(scope);if(last)backup=await ownBackup(scope,last);}catch{}
 if(token!==generation)return;
 let value=blank(),rev=0,pending=false,notice=uid?"Ready · sign-in cloud saves enabled":"Guest mode · local saves only";
 if(backup){
  value=backup.value;rev=backup.revision||0;pending=!!backup.pending;
  if(uid&&!pending){
   try{const result=await loadCloud(uid,backup.id);if(result){value=result.value;rev=result.revision;}else{value=blank();rev=0;}}
   catch(e){notice="Firebase unavailable. Showing your account's local backup: "+e.message;}
  }else if(uid&&pending)notice="Recovered unsynced local edits. Click Save to sync to Firebase.";
 }
 if(token!==generation)return;
 ready=true;app.inert=false;openValue(value,rev,pending);
 $("doc-storage-mode").textContent=uid?"Firebase account storage":"Guest · local storage";
 say(notice);
}
function download(name,body,type){const a=document.createElement("a");const url=URL.createObjectURL(new Blob([body],{type}));a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
const filename=()=>($("doc-title").value.trim()||"document").replace(/[\\/:*?"<>|]/g,"_").slice(0,100);
function htmlExport(){
 collect();const l=model.layout;const esc=v=>{const e=node("span",v);return e.innerHTML;};
 return '<!doctype html><html><head><meta charset="utf-8"><title>'+esc(model.title)+'</title><style>@page{size:'+l.width+'in '+l.height+'in;margin:0}body{margin:0}section{position:relative;box-sizing:border-box;width:'+l.width+'in;height:'+l.height+'in;padding:'+l.top+'in '+l.right+'in '+l.bottom+'in '+l.left+'in;break-after:page;page-break-after:always;font:11pt/1.15 Arial;overflow:hidden}section:last-child{break-after:auto;page-break-after:auto}img{max-width:100%;height:auto}table{border-collapse:collapse;width:100%;table-layout:fixed}td,th{border:1px solid #777;padding:5px}svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}header,footer{position:absolute;left:'+l.left+'in;right:'+l.right+'in;text-align:center;font:9pt Arial}header{top:'+l.top*.42+'in}footer{bottom:'+l.bottom*.38+'in}</style></head><body>'+model.pages.map((p,i)=>'<section><header>'+esc(l.header)+'</header>'+p.html+'<svg xmlns="'+ns+'" viewBox="0 0 '+l.width*96+' '+l.height*96+'">'+p.ink.map(v=>inkPath(v).outerHTML).join("")+'</svg><footer>'+esc([l.footer,l.numbers?i+1:""].filter(Boolean).join(" · "))+'</footer></section>').join("")+'</body></html>';
}
function printDoc(){updateInfo();if(pages().some(p=>p.dataset.overflow==="true")){say("Some text extends beyond the paper. Use Insert → Flow overflowing text or Page break here before printing.");alert("One or more pages overflow. Use Insert → Flow overflowing text or move text to another page before printing, so nothing is clipped.");return;}window.print();}
function setZoom(n){zoom=finite(n,40,130,90)/100;app.style.setProperty("--zoom",zoom);$("doc-zoom").value=zoom*100;$("doc-zoom-label").value=Math.round(zoom*100)+"%";}
const on=(i,f)=>$(i).addEventListener("click",f);
document.querySelectorAll("[data-ribbon]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-ribbon]").forEach(t=>t.setAttribute("aria-selected",String(t===b)));document.querySelectorAll("[data-ribbon-panel]").forEach(p=>p.hidden=p.dataset.ribbonPanel!==b.dataset.ribbon);});
document.querySelectorAll("[data-cmd]").forEach(b=>{b.addEventListener("mousedown",e=>e.preventDefault());b.onclick=()=>cmd(b.dataset.cmd);});
$("doc-font").onchange=e=>cmd("fontName",e.target.value);$("doc-size").onchange=e=>fontSize(e.target.value);$("doc-color").onchange=e=>cmd("foreColor",e.target.value);$("doc-highlight").onchange=e=>cmd("hiliteColor",e.target.value);$("doc-style").onchange=e=>cmd("formatBlock",e.target.value);$("doc-spacing").onchange=e=>blockStyle("line-height",e.target.value);
on("doc-apply-indent",()=>blockStyle("text-indent",finite($("doc-indent").value,0,3,0)+"in"));
$("doc-paragraph-after").onchange=e=>blockStyle("margin-bottom",e.target.value+"pt");
on("doc-cut",()=>cmd("cut"));on("doc-copy",()=>cmd("copy"));on("doc-paste",async()=>{try{const text=await navigator.clipboard.readText();cmd("insertText",text);}catch{say("Use Ctrl+V / Command+V to paste rich text or images.");}});
on("doc-add-page",()=>addPage(active+1));on("doc-side-add",()=>addPage());on("doc-break",breakPage);on("doc-flow",flowOverflow);on("doc-delete-page",removePage);
on("doc-image",()=>$("doc-image-file").click());$("doc-image-file").onchange=e=>{void imageFile(e.target.files[0]);e.target.value="";};
on("doc-image-size",()=>{if(!selectedImage?.isConnected){say("Click a picture first.");return;}const v=prompt("Picture width as percent of the text area (5–100)","75");if(v===null)return;selectedImage.style.width=finite(v,5,100,75)+"%";mark();});
on("doc-table",insertTable);
function currentCell(){if(!restore())return null;const n=getSelection().anchorNode;return (n?.nodeType===1?n:n?.parentElement)?.closest("td,th")||null;}
on("doc-table-row",()=>{const cell=currentCell();if(!cell){say("Click inside a table first.");return;}const table=cell.closest("table"),row=cell.parentElement;const fresh=table.insertRow(row.rowIndex+1);for(let i=0;i<row.cells.length;i++)fresh.insertCell().innerHTML="<br>";mark();});
on("doc-table-column",()=>{const cell=currentCell();if(!cell){say("Click inside a table first.");return;}for(const row of cell.closest("table").rows)row.insertCell(Math.min(cell.cellIndex+1,row.cells.length)).innerHTML="<br>";mark();});
on("doc-link",()=>{const v=prompt("Enter an http(s) URL or mailto link");if(v&&safeHref(v))cmd("createLink",v);});on("doc-rule",()=>cmd("insertHorizontalRule"));on("doc-symbol",()=>{const v=prompt("Enter a symbol","♥");if(v)cmd("insertText",v);});
on("doc-header-footer",()=>{const h=prompt("Header text",model.layout.header);if(h===null)return;const f=prompt("Footer text",model.layout.footer);if(f===null)return;model.layout=safeLayout({...model.layout,header:h,footer:f});updateDecorations();mark();});
on("doc-page-numbers",()=>{model.layout.numbers=!model.layout.numbers;updateDecorations();mark();});
on("doc-draw-toggle",()=>toggleDraw(!drawing));on("doc-erase",()=>{if(!drawing)toggleDraw(true);eraser=!eraser;$("doc-erase").setAttribute("aria-pressed",String(eraser));say(eraser?"Eraser: tap an ink stroke to remove it.":"Pen active.");});
on("doc-draw-clear",()=>{if(confirm("Clear all ink on this page?")){pages()[active].querySelector(".doc-ink").replaceChildren();mark();}});
function presetDimensions(){const p=presets[$("doc-paper").value];if(p){const [w,h]=$("doc-orientation").value==="landscape"?[p[1],p[0]]:p;$("doc-width").value=w;$("doc-height").value=h;}}
$("doc-paper").onchange=presetDimensions;$("doc-orientation").onchange=()=>{if($("doc-paper").value==="custom"){const w=$("doc-width").value;$("doc-width").value=$("doc-height").value;$("doc-height").value=w;}else presetDimensions();};
on("doc-layout-apply",()=>{model.layout=safeLayout({...model.layout,paper:$("doc-paper").value,width:$("doc-width").value,height:$("doc-height").value,top:$("doc-margin-top").value,bottom:$("doc-margin-bottom").value,left:$("doc-margin-left").value,right:$("doc-margin-right").value});applyLayout();mark();});
$("doc-zoom").oninput=e=>setZoom(Number(e.target.value));on("doc-fit",()=>setZoom(Math.floor(($("doc-paper-scroll").clientWidth-50)/(model.layout.width*96)*100)));
on("doc-toc",()=>toc());on("doc-toc-refresh",()=>toc(true));on("doc-find",()=>{const v=prompt("Find text");if(!v)return;const q=v.toLowerCase();const i=editors().findIndex(e=>e.innerText.toLowerCase().includes(q));if(i<0){say("Text not found.");return;}go(i,true);say("Text found on page "+(i+1)+".");});
on("doc-replace",()=>{const a=prompt("Find exact text");if(!a)return;const b=prompt("Replace with","");if(b===null)return;let count=0;for(const ed of editors()){const walker=document.createTreeWalker(ed,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){const parts=n.data.split(a);if(parts.length>1){count+=parts.length-1;n.data=parts.join(b);}}}mark();say("Replaced "+count+" occurrence(s) within text runs.");});
on("doc-save",()=>void save());on("doc-print",printDoc);on("doc-new",()=>void switchDoc(blank()));on("doc-library",()=>void library());on("doc-library-close",()=>$("doc-library-dialog").close());
on("doc-import",()=>$("doc-import-file").click());$("doc-import-file").onchange=async e=>{const f=e.target.files[0];e.target.value="";if(!f)return;try{if(f.size>25_000_000)throw Error("File exceeds 25 MB.");const text=await f.text();let value=blank();value.title=f.name.replace(/\.[^.]+$/,"");if(/\.(ptgdoc|json)$/i.test(f.name)){value=normalize(JSON.parse(text));value.id=id();}else if(/\.html?$/i.test(f.name)){value.pages=[{html:sanitize(text),ink:[]}];}else{const p=node("p",text);p.style.whiteSpace="pre-wrap";value.pages=[{html:text.split(/\r?\n/).map(x=>node("p",x).outerHTML).join(""),ink:[]}];}await switchDoc(value);}catch(error){say("Could not open file: "+error.message);}};
on("doc-export",()=>download(filename()+".ptgdoc",JSON.stringify(collect()),"application/json"));
on("doc-export-html",()=>download(filename()+".html",htmlExport(),"text/html;charset=utf-8"));
on("doc-export-text",()=>download(filename()+".txt",editors().map(e=>e.innerText).join("\n\f\n"),"text/plain;charset=utf-8"));
on("doc-export-word",()=>download(filename()+".doc",htmlExport(),"application/msword"));
$("doc-title").oninput=mark;
window.addEventListener("beforeunload",e=>{if(dirty||pendingCloud){e.preventDefault();e.returnValue="";}});
document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){e.preventDefault();void save();}if((e.ctrlKey||e.metaKey)&&e.key==="Enter"&&editor()?.contains(document.activeElement)){e.preventDefault();breakPage();}});
window.addEventListener("resize",updateInfo);
render();setZoom(90);app.inert=true;
onAuthStateChanged(auth,user=>void initializeAccount(user),error=>say("Account access unavailable: "+error.message));

// Bubbles is an original pink axolotl. No third-party character or artwork.
const mascot=$("bubbles"),pet=$("bubbles-pet"),speech=$("bubbles-message");
const tips=[
 "A blank page is just a very quiet pond. Start with one sentence.",
 "Use headings and I can help make a table of contents!",
 "My official job is morale. My unofficial job is inspecting imaginary snacks.",
 "Ctrl+S saves your document to Firebase when signed in. Download a backup too!",
 "An axolotl can regenerate limbs. Unfortunately, I cannot regenerate unsaved paragraphs.",
 "I counted all the bubbles in my pond. There were at least several.",
 "Choose Layout to change the paper size before printing.",
 "If text spills off a page, insert a page break. I prefer puddles, not floods.",
 "Pet me! I provide zero useful tax advice and approximately unlimited enthusiasm.",
 "Once upon a time, an imaginary office assistant had a pet axolotl. That's my entirely unofficial origin story."
];
let tipIndex=0,drag=null,dragged=false;
function talk(){speech.textContent=tips[tipIndex++%tips.length];mascot.classList.remove("petted");void mascot.offsetWidth;mascot.classList.add("petted");}
function position(x,y){const w=mascot.offsetWidth,h=mascot.offsetHeight;mascot.style.left=Math.max(0,Math.min(innerWidth-w,x))+"px";mascot.style.top=Math.max(0,Math.min(innerHeight-h,y))+"px";mascot.style.right="auto";mascot.style.bottom="auto";}
pet.addEventListener("pointerdown",e=>{const b=mascot.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:b.left,top:b.top};dragged=false;pet.setPointerCapture(e.pointerId);});
pet.addEventListener("pointermove",e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)dragged=true;if(dragged)position(drag.left+dx,drag.top+dy);});
pet.addEventListener("pointerup",()=>{drag=null;});pet.addEventListener("pointercancel",()=>{drag=null;});
pet.addEventListener("click",()=>{if(!dragged)talk();dragged=false;});
on("bubbles-tip",talk);on("bubbles-hide",()=>{mascot.hidden=true;});on("doc-bubbles-show",()=>{mascot.hidden=false;talk();});
window.addEventListener("resize",()=>{if(mascot.style.left){const r=mascot.getBoundingClientRect();position(r.left,r.top);}});
