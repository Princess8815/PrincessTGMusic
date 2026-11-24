// Shared document link policy. No publisher-controlled scripts or targets.
export const headingId=value=>/^doc-heading-[a-z0-9-]+$/i.test(value||"");
export function normalizeDocLink(raw,base){
 const value=String(raw??"").trim();
 if(!value||value.length>4096||/[\u0000-\u001f\u007f]/.test(value))return null;
 if(value.startsWith("#"))return headingId(value.slice(1))?{kind:"heading",id:value.slice(1)}:null;
 // Support a typed domain such as example.site as well as fully qualified links.
 const candidate=/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::[0-9]+)?(?:[/?#]|$)/i.test(value)&&!/\.(?:html?|php|aspx?)(?:[/?#]|$)/i.test(value)?"https://"+value:value;
 try{
  const url=new URL(candidate,base);
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password)return null;
  return {kind:"website",url};
 }catch{return null;}
}
export function isSiteLink(url,siteRoot){
 // GitHub Pages shares an origin with other projects. Match the actual
 // site path, not a string prefix of the hostname or another repo's path.
 const roots=[new URL(siteRoot),new URL("https://princess8815.github.io/PrincessTGMusic/")];
 return roots.some(root=>{
  const path=root.pathname.endsWith("/")?root.pathname:root.pathname+"/";
  if(url.origin!==root.origin)return false;
  let decoded;
  try{decoded=decodeURIComponent(url.pathname);}catch{return false;}
  if(/[\\\u0000-\u001f]/.test(decoded)||decoded.split("/").some(p=>p===".."||p==="."))return false;
  return decoded===path.slice(0,-1)||decoded.startsWith(path);
 });
}

// Linkify text without parsing HTML. Callers retain control over navigation.
export function appendDocText(parent,value,bind){
 const doc=parent.ownerDocument;
 if(parent.closest?.("a,pre,code")){parent.append(doc.createTextNode(value));return;}
 const pattern=/(^|[\s([{<"“‘])((?:https?:\/\/[^\s<>"“”‘’]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::[0-9]+)?(?:[/?#][^\s<>"“”‘’]*)?))(?=$|[\s)\]}>.,!?;:'"“”‘’])/gi;
 let offset=0;
 for(const match of value.matchAll(pattern)){
  const start=match.index+match[1].length;
  let raw=match[2];
  while(/[.,!?;:'\]}]$/.test(raw)||(/\)$/.test(raw)&&(raw.match(/\)/g)||[]).length>(raw.match(/\(/g)||[]).length))raw=raw.slice(0,-1);
  if(!raw||raw.length>4096)continue;
  if(!/^https?:\/\//i.test(raw)&&/\.(?:html?|php|aspx?|txt|json|pdf|docx?|xlsx?|png|jpe?g|gif|webp|css|js|zip|mp3|wav)(?:[/?#]|$)/i.test(raw))continue;
  const absolute=/^https?:\/\//i.test(raw)?raw:"https://"+raw;
  const target=normalizeDocLink(absolute,"https://invalid.example/");
  if(target?.kind!=="website")continue;
  parent.append(doc.createTextNode(value.slice(offset,start)));
  const a=doc.createElement("a");a.textContent=raw;bind(a,target.url.href);parent.append(a);
  offset=start+raw.length;
 }
 parent.append(doc.createTextNode(value.slice(offset)));
}
