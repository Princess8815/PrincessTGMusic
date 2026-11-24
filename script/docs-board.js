import {boardPage,readShared,validToken,shareUrl} from "./docs-share.js";
const $=id=>document.getElementById(id);
const status=t=>$("board-status").textContent=t;
function node(tag,text){const el=document.createElement(tag);el.textContent=text;return el;}
const esc=value=>node("span",String(value??"")).innerHTML;
const bounded=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):fallback;
// Untrusted shared documents are displayed in a sandboxed, scriptless,
// unique-origin frame. Only inline CSS and data images are permitted.
function preview(value){
 const l=value.layout||{},w=bounded(l.width,3,24,8.5),h=bounded(l.height,3,24,11);
 const margin=k=>bounded(l[k],.1,4,1);
 const pages=(Array.isArray(value.pages)?value.pages:[]).slice(0,300);
 function content(html){
  const d=new DOMParser().parseFromString(String(html||""),"text/html");
  const tags=new Set("P DIV SPAN BR B STRONG I EM U S STRIKE DEL SUB SUP H1 H2 H3 H4 H5 H6 BLOCKQUOTE PRE CODE UL OL LI TABLE THEAD TBODY TFOOT TR TD TH HR A IMG FONT".split(" "));
  const styles=new Set("font-family font-size font-weight font-style text-decoration text-decoration-line color background-color text-align text-indent line-height margin-left margin-right margin-top margin-bottom padding-left width height max-width vertical-align list-style-type border border-collapse".split(" "));
  const out=document.createElement("div");
  function visit(n,parent){
   if(n.nodeType===3){parent.append(document.createTextNode(n.data));return;}
   if(n.nodeType!==1)return;
   if(!tags.has(n.tagName)){if(!["SCRIPT","STYLE","IFRAME","OBJECT","EMBED","SVG","MATH","FORM","META","LINK","BASE"].includes(n.tagName))for(const c of n.childNodes)visit(c,parent);return;}
   const e=document.createElement(n.tagName.toLowerCase());
   if(n.tagName==="IMG"){const src=n.getAttribute("src")||"";if(!/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(src))return;e.src=src;e.alt=(n.alt||"Picture").slice(0,200);}
   if(n.tagName==="A"&&/^#doc-heading-[a-z0-9-]+$/i.test(n.getAttribute("href")||""))e.href=n.getAttribute("href");
   if(/^H[1-6]$/.test(n.tagName)&&/^doc-heading-[a-z0-9-]+$/i.test(n.id))e.id=n.id;
   for(const k of styles){const v=n.style.getPropertyValue(k);if(v&&v.length<180&&!/url\s*\(|expression|@import|javascript/i.test(v))e.style.setProperty(k,v);}
   if(n.tagName==="FONT")for(const k of ["face","size","color"]){const v=n.getAttribute(k);if(v&&v.length<100&&!/[<>{}]/.test(v))e.setAttribute(k,v);}
   if(["TD","TH"].includes(n.tagName))for(const k of ["colspan","rowspan"]){const v=Number(n.getAttribute(k));if(Number.isInteger(v)&&v>=1&&v<=30)e.setAttribute(k,v);}
   for(const c of n.childNodes)visit(c,e);parent.append(e);
  }
  for(const n of d.body.childNodes)visit(n,out);return out.innerHTML;
 }
 const ink=p=>(Array.isArray(p.ink)?p.ink:[]).slice(0,1500).filter(x=>x&&typeof x.d==="string"&&x.d.length<=100000&&/^[ML0-9., -]+$/.test(x.d)).map(x=>'<path d="'+x.d+'" fill="none" stroke="'+(/^#[a-f0-9]{6}$/i.test(x.color)?x.color:"#eb4a9c")+'" stroke-width="'+bounded(x.width,1,30,3)+'" stroke-linejoin="round" stroke-linecap="round"/>').join("");
 return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><style>*{box-sizing:border-box}body{margin:0;padding:12px;background:#ded6e1;color:#222;font:11pt/1.15 Arial,sans-serif}section{position:relative;margin:0 auto 16px;background:white;width:'+w+'in;height:'+h+'in;padding:'+margin("top")+'in '+margin("right")+'in '+margin("bottom")+'in '+margin("left")+'in;overflow:hidden}img{max-width:100%;height:auto}p{margin:0 0 .5em}h1{font-size:22pt}h2{font-size:16pt}h3{font-size:13pt}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{border:1px solid #777;padding:5px;overflow-wrap:anywhere}svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}header,footer{position:absolute;left:'+margin("left")+'in;right:'+margin("right")+'in;text-align:center;font:9pt Arial}header{top:'+margin("top")*.42+'in}footer{bottom:'+margin("bottom")*.38+'in}</style></head><body>'+pages.map((p,i)=>'<section><header>'+esc(l.header||"")+'</header>'+content(p.html)+'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w*96+' '+h*96+'">'+ink(p)+'</svg><footer>'+esc([l.footer,l.numbers?i+1:""].filter(Boolean).join(" · "))+'</footer></section>').join("")+'</body></html>';
}
let cursor=null,busy=false;
async function list(){
 if(busy)return;busy=true;$("board-more").disabled=true;
 try{
  const page=await boardPage(cursor);cursor=page.cursor;
  for(const item of page.items){
   if(!validToken(item.token))continue;
   const card=node("article","");card.className="docs-board-card";
   const a=node("a",item.title||"Untitled document");a.href=shareUrl(item.token);
   card.append(a,node("p",(item.pageCount||0)+" page(s) · public read-only document"));
   $("board-list").append(card);
  }
  $("board-more").hidden=!cursor;status($("board-list").children.length?"Browse documents published by site members.":"No public documents have been published yet.");
 }catch(e){status("Could not load the public board: "+e.message);}
 finally{busy=false;$("board-more").disabled=false;}
}
$("board-more").onclick=()=>void list();
const token=new URLSearchParams(location.search).get("share");
if(token!==null){
 $("board-title").textContent="Shared document";$("board-list").hidden=true;
 if(!validToken(token))status("Invalid document link.");
 else (async()=>{try{const {meta,value}=await readShared(token);$("board-title").textContent=meta.title||"Shared document";$("board-preview").srcdoc=preview(value);$("board-reader").hidden=false;status((meta.pageCount||0)+" page(s) · "+(meta.visibility==="public"?"Public":"Unlisted link"));}catch(e){status("Unable to open document: "+e.message);}})();
}else void list();
