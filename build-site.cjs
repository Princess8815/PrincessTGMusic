// Dependency-free publishing for the two hosts; source files are never edited.
const fs = require("node:fs");
const path = require("node:path");
const OLD = "https://princess8815.github.io/PrincessTGMusic";
const DEST = "https://princesstgcreations.pages.dev";
const PUBLIC = ["index.html","404.html","albums","arts","audioPlayer","data","images","pages","script","styles"];
function legacyTarget(location) {
  if (location.origin !== "https://princess8815.github.io") return null;
  const base = "/PrincessTGMusic";
  if (location.pathname !== base && !location.pathname.startsWith(base + "/")) return null;
  // Assign pathname on a fixed origin rather than interpreting arbitrary input as a URL.
  const target = new URL("https://princesstgcreations.pages.dev/");
  target.pathname = location.pathname.slice(base.length) || "/";
  target.search = location.search;
  target.hash = location.hash;
  return target.href;
}
function escaped(value) {
  return String(value).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function publicUrl(relative) {
  return DEST + "/" + relative.split("/").map(encodeURIComponent).join("/");
}
function updateMetadata(html) {
  // Only rewrite metadata/canonical tags, not lyrics, descriptions or arbitrary user links.
  return html.replace(/<(?:meta|link)\b[^>]*>/gi, tag => {
    if (!/\b(?:property|name)\s*=\s*["'](?:og:(?:url|image(?::secure_url)?)|twitter:(?:url|image(?::src)?))["']/i.test(tag) &&
        !/\brel\s*=\s*["']canonical["']/i.test(tag)) return tag;
    return tag.replace(/\b(content|href)(\s*=\s*["'])(https:\/\/princess8815\.github\.io\/PrincessTGMusic)(?=\/|["'?#])/gi,
      (_,attr,separator)=>attr+separator+DEST);
  });
}
function legacyPage(html,relative) {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || "";
  const metadata = (head.match(/<title\b[^>]*>[\s\S]*?<\/title>|<meta\b[^>]*>|<link\b[^>]*>/gi) || [])
    .filter(tag => /^<title\b/i.test(tag) || /^<meta\b/i.test(tag) &&
      !/\bhttp-equiv\s*=/i.test(tag) || /^<link\b/i.test(tag) && /\brel\s*=\s*["']canonical["']/i.test(tag));
  const fallback = relative === "404.html" ? DEST+"/" : publicUrl(relative);
  const preserved = updateMetadata(metadata.join("\n"));
  // Keep metadata visible to crawlers; no unconditional meta refresh or HTTP redirect.
  // The browser redirect runs before any application code, including Firebase or checkout.
  return '<!doctype html>\n<html lang="en"><head>\n'+
    '<meta charset="utf-8"><meta name="referrer" content="no-referrer">\n'+preserved+
    '\n<script>(()=>{const target=('+legacyTarget.toString()+')(location);if(target)location.replace(target);})();</script>'+
    '\n<style>body{font:1.1rem system-ui;max-width:44rem;margin:12vh auto;padding:1.5rem;background:#111827;color:#f3f4f6}a{color:#c4b5fd}</style>'+
    '\n</head><body><main><h1>PrincessTG Creations has moved</h1><p>Opening the same page at our new home.</p>'+
    '<p><a href="'+escaped(fallback)+'">Continue to PrincessTG Creations</a></p>'+
    '<noscript><p>Automatic navigation requires JavaScript. Use the link above; query parameters and anchors may need to be copied manually.</p></noscript></main></body></html>\n';
}
function build(mode,root=__dirname,output=path.join(root,"dist")) {
  if (!["cloudflare","legacy"].includes(mode)) throw Error("Use cloudflare or legacy mode");
  // Only the designated output directory can be replaced.
  if (path.resolve(output)!==path.resolve(root,"dist")) throw Error("Unexpected output directory");
  fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(output,{recursive:true});
  for(const entry of PUBLIC){
    fs.cpSync(path.join(root,entry),path.join(output,entry),{
      recursive:true,filter: source=>{
        const name=path.basename(source);
        return !name.startsWith(".")&&!/\.bak$/i.test(name)&&!fs.lstatSync(source).isSymbolicLink();
      }
    });
  }
  let count=0;
  function walk(folder){
    for(const item of fs.readdirSync(folder,{withFileTypes:true})){
      const file=path.join(folder,item.name);
      if(item.isDirectory()){walk(file);continue;}
      if(!item.isFile()||!/\.html$/i.test(item.name))continue;
      const relative=path.relative(output,file).split(path.sep).join("/");
      const html=fs.readFileSync(file,"utf8");
      fs.writeFileSync(file,mode==="legacy"?legacyPage(html,relative):updateMetadata(html));
      count++;
    }
  }
  walk(output);return count;
}
module.exports={legacyTarget,updateMetadata,legacyPage,build,DEST,OLD};
if(require.main===module) console.log("Published "+build(process.argv[2])+" HTML pages in "+process.argv[2]+" mode.");
