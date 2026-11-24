// Native Office Open XML (.docx), not an HTML file renamed .doc.
// ZIP uses the standard STORE method so no third-party runtime is required.
const enc=new TextEncoder();
const xml=s=>String(s??"").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const X='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const W="http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R="http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const relNS="http://schemas.openxmlformats.org/package/2006/relationships";
const twip=v=>Math.round(Number(v)*1440);
const bound=(v,a,b,f)=>Number.isFinite(Number(v))?Math.min(b,Math.max(a,Number(v))):f;
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=(c>>>8)^crcTable[(c^b)&255];return (c^0xffffffff)>>>0;}
export function zipStore(files){
 const chunks=[],central=[];let offset=0,centralBytes=0;
 function record(size,fn){const b=new Uint8Array(size),v=new DataView(b.buffer);fn(v);return b;}
 for(const [name,content] of files){
  const key=enc.encode(name),data=typeof content==="string"?enc.encode(content):content,crc=crc32(data);
  const local=record(30,v=>{v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,key.length,true);});
  const dir=record(46,v=>{v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint32(16,crc,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);v.setUint16(28,key.length,true);v.setUint32(42,offset,true);});
  chunks.push(local,key,data);central.push(dir,key);offset+=local.length+key.length+data.length;centralBytes+=dir.length+key.length;
 }
 const end=record(22,v=>{v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,centralBytes,true);v.setUint32(16,offset,true);});
 return new Blob([...chunks,...central,end],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
}
const len=(v,base=0)=>{const m=String(v||"").trim().match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(pt|px|in|cm|mm|%|em)?$/);if(!m)return null;const n=Number(m[1]);return Math.round(n*({pt:20,px:15,in:1440,cm:1440/2.54,mm:1440/25.4,"%":base/100,em:220,"":15}[m[2]||""]));};
function color(v){if(!v)return null;let m=v.match(/^#([0-9a-f]{6})$/i);if(m)return m[1].toUpperCase();m=v.match(/^#([0-9a-f]{3})$/i);if(m)return [...m[1]].map(c=>c+c).join("").toUpperCase();m=v.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/);return m?m.slice(1).map(x=>bound(x,0,255,0).toString(16).padStart(2,"0")).join("").toUpperCase():null;}
function runProps(f){
 let r="";
 for(const [key,tag] of [["bold","b"],["italic","i"],["strike","strike"]])if(f[key]!==undefined)r+='<w:'+tag+' w:val="'+(f[key]?1:0)+'"/>';
 if(f.underline!==undefined)r+='<w:u w:val="'+(f.underline?"single":"none")+'"/>';
 if(f.font)r+='<w:rFonts w:ascii="'+xml(f.font)+'" w:hAnsi="'+xml(f.font)+'" w:eastAsia="'+xml(f.font)+'"/>';
 if(f.size)r+='<w:sz w:val="'+f.size+'"/><w:szCs w:val="'+f.size+'"/>';
 if(f.color)r+='<w:color w:val="'+f.color+'"/>';
 if(f.bg)r+='<w:shd w:val="clear" w:fill="'+f.bg+'"/>';
 if(f.vertical)r+='<w:vertAlign w:val="'+f.vertical+'"/>';
 return r?"<w:rPr>"+r+"</w:rPr>":"";
}
function format(el,parent){
 const f={...parent},tag=el.tagName,s=el.style;
 if(["B","STRONG"].includes(tag))f.bold=true;if(["I","EM"].includes(tag))f.italic=true;
 if(tag==="U")f.underline=true;if(["S","STRIKE","DEL"].includes(tag))f.strike=true;
 if(tag==="SUP")f.vertical="superscript";if(tag==="SUB")f.vertical="subscript";
 if(s.fontWeight)f.bold=s.fontWeight==="bold"||Number(s.fontWeight)>=600;
 if(s.fontStyle)f.italic=s.fontStyle==="italic"||s.fontStyle==="oblique";
 const decoration=s.textDecorationLine||s.textDecoration;if(decoration){f.underline=decoration.includes("underline");f.strike=decoration.includes("line-through");}
 const family=s.fontFamily||el.getAttribute("face");if(family)f.font=family.split(",")[0].replace(/["']/g,"").trim().slice(0,100);
 const size=len(s.fontSize);if(size!==null)f.size=bound(Math.round(size/10),2,400,22);
 else if(tag==="FONT"&&el.getAttribute("size"))f.size=([16,20,24,28,36,48,72][Number(el.getAttribute("size"))-1]||22);
 const fg=color(s.color||el.getAttribute("color"));if(fg)f.color=fg;const bg=color(s.backgroundColor);if(bg)f.bg=bg;
 return f;
}
const textRun=(s,f={})=>"<w:r>"+runProps(f)+'<w:t xml:space="preserve">'+xml(s)+"</w:t></w:r>";
const br="<w:r><w:br/></w:r>";
const blockTags=new Set(["P","DIV","H1","H2","H3","H4","H5","H6","BLOCKQUOTE","PRE","UL","OL","LI","TABLE","HR"]);
export async function makeDocx(model){
 const l=model.layout,w=bound(l.width,3,24,8.5),h=bound(l.height,3,24,11),ml=bound(l.left,.1,4,1),mr=bound(l.right,.1,4,1);
 const available=twip(Math.max(.25,w-ml-mr));const files=[],relationships=[],warnings=new Set();
 let rid=0,pictureId=0;
 const rel=(type,target,external=false)=>{const id="rId"+(++rid);relationships.push('<Relationship Id="'+id+'" Type="'+R+'/'+type+'" Target="'+xml(target)+'"'+(external?' TargetMode="External"':'')+'/>');return id;};
 const relFile=items=>X+'<Relationships xmlns="'+relNS+'">'+items.join("")+'</Relationships>';
 const imgMime={png:"png",jpeg:"jpg",webp:"webp",gif:"gif"};
 async function imageRun(el){
  const src=el.getAttribute("src")||"",m=src.match(/^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i);
  if(!m){warnings.add("Some images could not be embedded.");return textRun("[Picture]");}
  let ext=imgMime[m[1].toLowerCase()],bytes;
  const image=new Image();
  try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=src;});
   if(ext==="webp"||ext==="gif"){
    const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext("2d").drawImage(image,0,0);
    const b64=canvas.toDataURL("image/png").split(",")[1];bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));ext="png";
   }else bytes=Uint8Array.from(atob(m[2].replace(/\s/g,"")),c=>c.charCodeAt(0));
  }catch{warnings.add("Some images could not be embedded.");return textRun("[Picture]");}
  const num=++pictureId,name="image"+num+"."+ext;files.push(["word/media/"+name,bytes]);const id=rel("image","media/"+name);
  const width=Math.max(100,Math.min(available,len(el.style.width,available)||image.naturalWidth*15));
  const height=Math.max(100,Math.round(width*image.naturalHeight/Math.max(1,image.naturalWidth)));
  const cx=width*635,cy=height*635,alt=xml(el.alt||"Picture");
  return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="'+cx+'" cy="'+cy+'"/><wp:docPr id="'+num+'" name="Picture '+num+'" descr="'+alt+'"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="'+name+'"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="'+id+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
 }
 async function runs(n,f={}){
  if(n.nodeType===3)return textRun(n.data,f);if(n.nodeType!==1)return "";
  if(n.tagName==="BR")return br;if(n.tagName==="IMG")return imageRun(n);
  const next=format(n,f);let result="";for(const c of n.childNodes)result+=await runs(c,next);
  if(n.tagName==="A"){
   const href=n.getAttribute("href")||"";
   if(/^(https?:\/\/|mailto:)/i.test(href)&&!/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(href)){const id=rel("hyperlink",href,true);return '<w:hyperlink r:id="'+id+'">'+result+'</w:hyperlink>';}
  }
  return result;
 }
 function pPr(el,heading=0,extra=""){
  const s=el?.style||{},align=s.textAlign||el?.getAttribute?.("align");
  let p=heading?'<w:pStyle w:val="Heading'+heading+'"/>':"";
  if(["left","center","right","justify"].includes(align))p+='<w:jc w:val="'+(align==="justify"?"both":align)+'"/>';
  const after=len(s.marginBottom),before=len(s.marginTop),line=Number(s.lineHeight);
  if(after!==null||before!==null||(Number.isFinite(line)&&line>0)){
   p+='<w:spacing'+(after!==null?' w:after="'+Math.max(0,after)+'"':"")+(before!==null?' w:before="'+Math.max(0,before)+'"':"")+(line>0?' w:line="'+Math.round(line*240)+'" w:lineRule="auto"':"")+'/>';
  }
  const first=len(s.textIndent),left=len(s.marginLeft),right=len(s.marginRight);
  if(first!==null||left!==null||right!==null)p+='<w:ind'+(first!==null?(first>=0?' w:firstLine="'+first+'"':' w:hanging="'+(-first)+'"'):"")+(left!==null?' w:left="'+Math.max(0,left)+'"':"")+(right!==null?' w:right="'+Math.max(0,right)+'"':"")+'/>';
  return p||extra?"<w:pPr>"+extra+p+"</w:pPr>":"";
 }
 const para=(content,el,head=0,extra="")=>"<w:p>"+pPr(el,head,extra)+content+"</w:p>";
 async function blocks(parent,inherited={}){
  let result="",pending="";
  const flush=()=>{if(pending){result+=para(pending);pending="";}};
  for(const n of parent.childNodes){
   if(n.nodeType===3){if(n.data.trim()||pending)pending+=textRun(n.data,inherited);continue;}
   if(n.nodeType!==1)continue;
   const tag=n.tagName;
   if(!blockTags.has(tag)){pending+=await runs(n,inherited);continue;}
   flush();const f=format(n,inherited);
   if(tag==="TABLE"){
    const rows=[...n.rows],cols=Math.max(1,...rows.map(r=>[...r.cells].reduce((a,c)=>a+(c.colSpan||1),0)));let table='<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>'+["top","left","bottom","right","insideH","insideV"].map(k=>'<w:'+k+' w:val="single" w:sz="4" w:color="777777"/>').join("")+'</w:tblBorders></w:tblPr><w:tblGrid>'+Array.from({length:cols},()=>'<w:gridCol w:w="'+Math.floor(available/cols)+'"/>').join("")+'</w:tblGrid>';
    for(const row of rows){table+="<w:tr>";for(const cell of row.cells){let cellContent=await blocks(cell,cell.tagName==="TH"?{...f,bold:true}:f);table+='<w:tc><w:tcPr><w:tcW w:w="'+Math.floor(available/cols)*(cell.colSpan||1)+'" w:type="dxa"/>'+(cell.colSpan>1?'<w:gridSpan w:val="'+cell.colSpan+'"/>':"")+'</w:tcPr>'+(cellContent||"<w:p/>")+'</w:tc>';}table+="</w:tr>";}result+=table+"</w:tbl>";continue;
   }
   if(tag==="UL"||tag==="OL"){
    let index=0;for(const li of n.children){if(li.tagName!=="LI")continue;let r="";for(const c of li.childNodes)if(!["UL","OL"].includes(c.tagName))r+=await runs(c,format(li,f));result+=para(textRun(tag==="UL"?"• ":""+(++index)+". ",f)+r,li);for(const nested of li.children)if(["UL","OL"].includes(nested.tagName)){const wrapper=document.createElement("div");wrapper.append(nested.cloneNode(true));result+=await blocks(wrapper,f);}}continue;
   }
   if(tag==="DIV"&&[...n.children].some(c=>blockTags.has(c.tagName))){result+=await blocks(n,f);continue;}
   if(tag==="HR"){result+='<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:color="777777"/></w:pBdr></w:pPr></w:p>';continue;}
   let r="";for(const child of n.childNodes)r+=await runs(child,f);
   const heading=/^H[1-6]$/.test(tag)?Number(tag[1]):0;
   result+=para(r,n,heading);
  }
  flush();return result;
 }
 let body="";
 for(let i=0;i<model.pages.length;i++){
  if(i)body+='<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const page=model.pages[i],template=document.createElement("template");template.innerHTML=page.html||"";
  body+=(await blocks(template.content))||"<w:p/>";
  if(page.ink?.length)warnings.add("Freehand drawings are retained in project, HTML and PDF exports, but not in editable Word.");
 }
 const styles=X+'<w:styles xmlns:w="'+W+'"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'+Array.from({length:6},(_,i)=>'<w:style w:type="paragraph" w:styleId="Heading'+(i+1)+'"><w:name w:val="heading '+(i+1)+'"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="'+i+'"/></w:pPr><w:rPr><w:b/><w:sz w:val="'+([44,32,26,24,22,22][i])+'"/></w:rPr></w:style>').join("")+'</w:styles>';
 rel("styles","styles.xml");files.push(["word/styles.xml",styles]);
 let refs="";
 if(l.header){const id=rel("header","header1.xml");refs+='<w:headerReference w:type="default" r:id="'+id+'"/>';files.push(["word/header1.xml",X+'<w:hdr xmlns:w="'+W+'"><w:p><w:pPr><w:jc w:val="center"/></w:pPr>'+textRun(l.header,{size:18})+'</w:p></w:hdr>']);}
 if(l.footer||l.numbers){const id=rel("footer","footer1.xml");refs+='<w:footerReference w:type="default" r:id="'+id+'"/>';files.push(["word/footer1.xml",X+'<w:ftr xmlns:w="'+W+'"><w:p><w:pPr><w:jc w:val="center"/></w:pPr>'+textRun(l.footer||"",{size:18})+(l.numbers?textRun(l.footer?" · ":"",{size:18})+'<w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple>':"")+'</w:p></w:ftr>']);}
 const sect='<w:sectPr>'+refs+'<w:pgSz w:w="'+twip(w)+'" w:h="'+twip(h)+'"'+(w>h?' w:orient="landscape"':"")+'/><w:pgMar w:top="'+twip(bound(l.top,.1,4,1))+'" w:right="'+twip(mr)+'" w:bottom="'+twip(bound(l.bottom,.1,4,1))+'" w:left="'+twip(ml)+'" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>';
 files.push(["word/document.xml",X+'<w:document xmlns:w="'+W+'" xmlns:r="'+R+'" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>'+body+sect+'</w:body></w:document>']);
 files.push(["word/_rels/document.xml.rels",relFile(relationships)],["_rels/.rels",relFile(['<Relationship Id="rId1" Type="'+R+'/officeDocument" Target="word/document.xml"/>'])]);
 const ct='<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'+(l.header?'<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>':"")+(l.footer||l.numbers?'<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>':"")+'</Types>';
 files.push(["[Content_Types].xml",X+ct]);return {blob:zipStore(files),warnings:[...warnings]};
}
