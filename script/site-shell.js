// Public navigation renders independently of Firebase; account links attach later.
import {isLocalPreview,getLocalFirebaseMode,setLocalFirebaseMode,LOCAL_FIREBASE_MODE_KEY} from "./firebase-mode.js";
const root=new URL("../",import.meta.url);
const siteUrl=path=>new URL(path,root).href;
const SETTINGS_KEY="princesstg-site-preferences-v1";
const FIELDS=["primary","secondary","tertiary","textColor","highlight"];
export const DEFAULT_PALETTE=Object.freeze({
  primary:"#9f7bff",
  secondary:"#1f2937",
  tertiary:"#111827",
  textColor:"#f3f4f6",
  highlight:"#c084fc"
});
export const DEFAULT_SETTINGS=Object.freeze({
  ...DEFAULT_PALETTE,text:"normal",contrast:"normal",motion:"normal"
});
const OPTIONS={text:["normal","large"],contrast:["normal","high"],motion:["normal","reduce"]};
const LEGACY_ACCENTS={
  violet:{primary:"#9f7bff",highlight:"#c084fc"},
  rose:{primary:"#f28cbe",highlight:"#fa95c6"},
  teal:{primary:"#65d9d0",highlight:"#67e7d6"}
};
const isHex=value=>typeof value==="string"&&/^#[0-9a-f]{6}$/i.test(value);
export function normalizeColor(value){
  if(!isHex(value))throw Error("Use a six-digit hex/RGB color.");
  return value.toLowerCase();
}
export function rgbFromHex(hex){
  const value=normalizeColor(hex);
  return [1,3,5].map(at=>parseInt(value.slice(at,at+2),16));
}
export function hexFromRgb(red,green,blue){
  const values=[red,green,blue];
  if(values.some(n=>!Number.isInteger(Number(n))||Number(n)<0||Number(n)>255))
    throw Error("RGB channels must be whole numbers from 0 to 255.");
  return "#"+values.map(n=>Number(n).toString(16).padStart(2,"0")).join("");
}
function channelLum(channel){
  const value=channel/255;
  return value<=0.04045?value/12.92:Math.pow((value+0.055)/1.055,2.4);
}
export function colorContrast(a,b){
  const left=rgbFromHex(a).map(channelLum);
  const right=rgbFromHex(b).map(channelLum);
  const lum=channels=>channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
  const x=lum(left),y=lum(right);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
function readableOn(hex){
  return colorContrast(hex,"#101118")>=colorContrast(hex,"#ffffff")?"#101118":"#ffffff";
}
export function getSiteSettings(){
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}")||{};}catch{}
  if(typeof saved!=="object"||Array.isArray(saved))saved={};
  const settings={...DEFAULT_SETTINGS};
  if(LEGACY_ACCENTS[saved.accent] && !isHex(saved.primary) && !isHex(saved.highlight))
    Object.assign(settings,LEGACY_ACCENTS[saved.accent]);
  for(const [name,allowed] of Object.entries(OPTIONS))
    if(allowed.includes(saved[name]))settings[name]=saved[name];
  for(const name of FIELDS)
    if(isHex(saved[name]))settings[name]=saved[name].toLowerCase();
  return settings;
}
export function applySiteSettings(settings=getSiteSettings()){
  const html=document.documentElement;
  for(const [name,allowed] of Object.entries(OPTIONS)){
    html.dataset["ptg"+name[0].toUpperCase()+name.slice(1)]=
      allowed.includes(settings[name])?settings[name]:DEFAULT_SETTINGS[name];
  }
  const values={};
  for(const field of FIELDS)
    values[field]=isHex(settings[field])?settings[field].toLowerCase():DEFAULT_PALETTE[field];
  const props={
    "--ptg-primary":values.primary,
    "--ptg-secondary":values.secondary,
    "--ptg-tertiary":values.tertiary,
    "--ptg-text":values.textColor,
    "--ptg-highlight":values.highlight,
    "--ptg-on-primary":readableOn(values.primary),
    "--ptg-on-highlight":readableOn(values.highlight)
  };
  for(const [name,value] of Object.entries(props))html.style.setProperty(name,value);
  html.style.colorScheme=colorContrast(values.tertiary,"#ffffff")>
    colorContrast(values.tertiary,"#101118")?"dark":"light";
}
export function saveSiteSettings(next){
  if(!next||typeof next!=="object")throw Error("Invalid settings.");
  const data={...getSiteSettings(),...next};
  for(const [name,allowed] of Object.entries(OPTIONS))
    if(!allowed.includes(data[name]))throw Error("Invalid "+name+" setting.");
  for(const name of FIELDS)data[name]=normalizeColor(data[name]);
  // Legacy preset was migrated to the explicit five-channel palette.
  delete data.accent;
  localStorage.setItem(SETTINGS_KEY,JSON.stringify(data));
  applySiteSettings(data);
  window.dispatchEvent(new CustomEvent("princesstg:settings-changed",{detail:data}));
  return data;
}

applySiteSettings();
window.addEventListener("storage",event=>{
  if(event.key===SETTINGS_KEY)applySiteSettings(getSiteSettings());
});
function installThemeCSS(){
  if(document.querySelector('link[data-ptg-theme-style]'))return;
  const css=document.createElement("link");
  css.rel="stylesheet";
  css.href=siteUrl("styles/site-theme.css");
  css.dataset.ptgThemeStyle="1";
  document.head.append(css);
}
if(!document.querySelector('link[data-ptg-shell-style]')){
  const css=document.createElement("link");
  css.rel="stylesheet";
  css.href=siteUrl("styles/site-shell.css");
  css.dataset.ptgShellStyle="1";
  document.head.append(css);
}
installThemeCSS();
const SVG=(paths)=>'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+paths+'</svg>';
const ICONS={
  home:SVG('<path d="m3 10 9-7 9 7v10h-6v-6H9v6H3z"/>'),
  music:SVG('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  store:SVG('<path d="M3 4h2l2 12h12l2-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>'),
  albums:SVG('<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
  releases:SVG('<path d="M4 5h16v14H4zM8 9h8M8 13h6M8 17h4"/>'),
  challenges:SVG('<path d="M9 3h6l2 4 4 2-4 4-1 8-4-3-4 3-1-8-4-4 4-2z"/>'),
  poetry:SVG('<path d="M5 20h14M8 17l10-10 2 2-10 10H8zM16 5l2-2 3 3-2 2"/>'),
  stories:SVG('<path d="M12 6c-3-2-7-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V5c-3-1-7-1-10 1zM12 6v15"/>'),
  about:SVG('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-5 3-8 8-8s8 3 8 8"/>'),
  roadmap:SVG('<path d="M5 20V4m0 2c3-3 5 3 8 0s5 3 8 0v9c-3 3-5-3-8 0s-5-3-8 0"/>'),
  profile:SVG('<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>'),
  docs:SVG('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  health:SVG('<path d="M20.5 8.5c0 4.5-8.5 10.5-8.5 10.5S3.5 13 3.5 8.5C3.5 3.5 9 3 12 7c3-4 8.5-3.5 8.5 1.5z"/><path d="M7 11h3l1.4-2 2 4 1.4-2H17"/>'),
  admin:SVG('<path d="M4 9h16v12H4zM8 9V6a4 4 0 0 1 8 0v3M12 13v4"/>'),
  settings:SVG('<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/>'),
  hamburger:SVG('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  close:SVG('<path d="M5 5l14 14M19 5 5 19"/>')
};
const GROUPS=[
  {title:"Explore",links:[
    ["Home","index.html","home"],
    ["About Me","pages/about-the-author.html","about"],
    ["Development Roadmap","pages/roadmap.html","roadmap"]]},
  {title:"Music",links:[
    ["All Songs","audioPlayer/index.html","music"],
    ["Albums","albums/index.html","albums"],
    ["CD Store","pages/store.html","store"],
    ["Releases","pages/releases.html","releases"]]},
  {title:"Create & Discover",links:[
    ["Songwriter Challenges","pages/challenges.html","challenges"],
    ["Accidental Songwriter","pages/Accidental-Songwriters-Challenge.html","challenges"],
    ["Poetry","pages/poems-home.html","poetry"],
    ["Stories","arts/artsLanding.html","stories"]]},
  {title:"Productivity",links:[
    ["PrincessTG Docs","pages/docs.html","docs"],
    ["Public Doc Board","pages/docs-board.html","docs"]]},
  {title:"Wellness",links:[
    ["Health Tracker","pages/health.html","health"]]},
  {title:"Account",links:[
    ["My Profile","pages/profile.html","profile","profile"],
    ["Admin Panel","pages/admin.html","admin","admin"],
    ["Settings","pages/settings.html","settings"]]},
  {title:"Legal & Policies",links:[
    ["Privacy Policy","pages/privacy-policy.html","docs"],
    ["Terms of Service","pages/terms-of-service.html","docs"],
    ["Refund & Return Policy","pages/refund-policy.html","docs"],
    ["Shipping Policy","pages/shipping-policy.html","docs"]]}
];
const SOCIALS=[
  ["Facebook","https://www.facebook.com/kirstin.transgirl/","https://cdn.simpleicons.org/facebook"],
  ["TikTok","https://www.tiktok.com/@princesstg8815","https://cdn.simpleicons.org/tiktok"],
  ["Instagram","https://www.instagram.com/princesstg8815/","https://cdn.simpleicons.org/instagram"],
  ["LinkedIn","https://www.linkedin.com/in/kirstin-transgirl-991aa9307/","https://cdn.simpleicons.org/linkedin"],
  ["Medium","https://medium.com/@transgirl1991","https://cdn.simpleicons.org/medium"],
  ["X","https://x.com/KTransgirl","https://cdn.simpleicons.org/x"],
  ["Email","mailto:princesstgcreations@yahoo.com",null]
];
function isCurrent(path){
  const current=decodeURI(location.pathname);
  const target=decodeURI(new URL(path,root).pathname);
  if(path==="index.html")return current===target||current===decodeURI(root.pathname);
  if(path==="audioPlayer/index.html")return current===target||current.includes("/audioPlayer/pages/");
  if(path==="albums/index.html")return current===target||
    (current.includes("/albums/")&&!current.endsWith("/albums/index.html"));
  if(path==="arts/artsLanding.html")return current===target||current.includes("/arts/herobrine/");
  return current===target;
}
function buildSidebar(){
  const aside=document.createElement("aside");
  aside.id="ptg-site-sidebar";aside.className="ptg-sidebar";
  aside.setAttribute("aria-label","Site menu");
  const brand=document.createElement("a");
  brand.className="ptg-brand";brand.href=siteUrl("index.html");
  const image=document.createElement("img");
  image.className="ptg-brand-icon";image.src=siteUrl("images/logo avatar.png");
  image.alt="";
  const words=document.createElement("span");words.textContent="PrincessTG";
  const small=document.createElement("small");small.textContent="Creations";
  words.append(small);brand.append(image,words);aside.append(brand);
  const nav=document.createElement("nav");
  nav.setAttribute("aria-label","Main site navigation");
  const special={};
  for(const group of GROUPS){
    const section=document.createElement("div");section.className="ptg-nav-group";
    const heading=document.createElement("div");heading.className="ptg-nav-label";
    heading.textContent=group.title;section.append(heading);
    for(const [label,path,icon,access] of group.links){
      const link=document.createElement("a");
      link.className="ptg-nav-link";link.href=siteUrl(path);
      link.innerHTML=ICONS[icon]||ICONS.home;
      const name=document.createElement("span");name.textContent=label;link.append(name);
      if(isCurrent(path))link.setAttribute("aria-current","page");
      if(access){link.hidden=true;special[access]=link;}
      section.append(link);
    }
    nav.append(section);
  }
  aside.append(nav);
  const bottom=document.createElement("p");
  bottom.className="ptg-sidebar-bottom";bottom.textContent="Original music, stories & more";
  aside.append(bottom);
  document.body.prepend(aside);
  return {aside,special};
}
function buildFooter(){
  if(location.pathname===new URL("index.html",root).pathname || location.pathname===root.pathname){
    // Replace the oversized old home contact cards with compact social icons.
    const old=document.querySelector("body > footer:not(.ptg-global-footer)");
    if(old && old.querySelector(".social-platforms"))old.remove();
  }
  const footer=document.createElement("footer");
  footer.className="ptg-global-footer";
  footer.setAttribute("aria-label","Contact and social media");
  const inner=document.createElement("div");inner.className="ptg-footer-inner";
  const copy=document.createElement("span");copy.className="ptg-footer-copy";
  copy.textContent="© "+new Date().getFullYear()+" PrincessTG Creations";
  const socials=document.createElement("nav");socials.className="ptg-footer-socials";
  socials.setAttribute("aria-label","Connect with PrincessTG");
  for(const [label,href,src] of SOCIALS){
    const a=document.createElement("a");
    a.href=href;a.title=label;a.setAttribute("aria-label",label);
    if(!href.startsWith("mailto:")){a.target="_blank";a.rel="noopener noreferrer";}
    if(src){
      const img=document.createElement("img");img.src=src;img.alt="";img.loading="lazy";
      a.append(img);
    }else{
      a.innerHTML=SVG('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>');
    }
    socials.append(a);
  }
  inner.append(copy,socials);footer.append(inner);
  document.body.append(footer);
}
function buildMobileBar(){
  const bar=document.createElement("div");bar.className="ptg-mobile-topbar";
  const button=document.createElement("button");
  button.id="ptg-mobile-toggle";button.type="button";
  button.className="ptg-mobile-toggle";
  button.setAttribute("aria-controls","ptg-site-sidebar");
  button.setAttribute("aria-expanded","false");
  button.setAttribute("aria-label","Open site menu");
  button.innerHTML=ICONS.hamburger;
  const brand=document.createElement("a");
  brand.className="ptg-mobile-title";brand.href=siteUrl("index.html");
  brand.textContent="PrincessTG Creations";
  bar.append(button,brand);document.body.prepend(bar);
  return button;
}
function buildLocalFirebaseControl(sidebar){
  if(!isLocalPreview()||document.getElementById("ptg-local-firebase-control"))return;
  const live=getLocalFirebaseMode()==="production";
  const control=document.createElement("div");
  control.id="ptg-local-firebase-control";
  control.className="ptg-local-firebase-control";
  control.dataset.mode=live?"production":"emulator";
  control.setAttribute("role","group");
  control.setAttribute("aria-label","Local developer Firebase connection");
  const label=document.createElement("strong");
  label.className="ptg-local-firebase-label";
  label.textContent=live?"Live Firebase":"Local emulators";
  label.title=live?"Real accounts and data":"Isolated test accounts";
  const button=document.createElement("button");
  button.type="button";
  button.textContent=live?"Switch to emulator":"Switch to live";
  button.title=live?"Use isolated test accounts":"Use real Firebase accounts and data";
  const status=document.createElement("span");
  status.className="ptg-local-firebase-status";
  status.setAttribute("role","status");
  status.setAttribute("aria-live","polite");
  button.addEventListener("click",()=>{
    const next=live?"emulator":"production";
    if(next==="production"&&!window.confirm(
      "Switch this local preview to LIVE Firebase?\n\n"+
      "You will use REAL accounts and database records. Tests may change or delete real data.\n\nContinue?"
    ))return;
    try{
      setLocalFirebaseMode(next);
      button.disabled=true;
      status.textContent="Reloading…";
      window.location.reload();
    }catch(error){
      button.disabled=false;
      status.textContent="Could not switch: "+error.message;
    }
  });
  control.append(label,button,status);
  // In-flow navigation item, never an overlay on the page.
  sidebar.querySelector("nav").before(control);
  window.addEventListener("storage",event=>{
    if(event.key===LOCAL_FIREBASE_MODE_KEY&&getLocalFirebaseMode()!==(live?"production":"emulator"))
      window.location.reload();
  });
}
function init(){
  if(document.getElementById("ptg-site-sidebar"))return;
  const {aside,special}=buildSidebar();
  const toggle=buildMobileBar();
  buildFooter();
  buildLocalFirebaseControl(aside);
  document.body.classList.add("ptg-shell-ready");

  const media=window.matchMedia("(max-width:850px)");
  let isOpen=false;
  function syncMenu(){
    if(!media.matches)isOpen=false;
    document.body.classList.toggle("ptg-menu-open",isOpen);
    toggle.setAttribute("aria-expanded",String(isOpen));
    toggle.setAttribute("aria-label",isOpen?"Close site menu":"Open site menu");
    toggle.innerHTML=isOpen?ICONS.close:ICONS.hamburger;
    aside.inert=media.matches&&!isOpen;
    aside.setAttribute("aria-hidden",String(media.matches&&!isOpen));
  }
  function closeMenu(restoreFocus=false){
    if(!isOpen)return;
    isOpen=false;syncMenu();
    if(restoreFocus)toggle.focus();
  }
  toggle.addEventListener("click",()=>{
    isOpen=!isOpen;syncMenu();
    if(isOpen)aside.querySelector("nav a:not([hidden])")?.focus();
    else toggle.focus();
  });
  aside.addEventListener("click",event=>{
    if(event.target.closest("a"))closeMenu();
  });
  document.addEventListener("keydown",event=>{
    if(!isOpen||!media.matches)return;
    if(event.key==="Escape"){event.preventDefault();closeMenu(true);return;}
    if(event.key!=="Tab")return;
    const focus=[...aside.querySelectorAll("a:not([hidden]), button:not([hidden]):not(:disabled)")];
    if(!focus.length)return;
    const first=focus[0],last=focus[focus.length-1];
    if(event.shiftKey && document.activeElement===first){
      event.preventDefault();toggle.focus();
    }else if(!event.shiftKey && document.activeElement===last){
      event.preventDefault();toggle.focus();
    }else if(!event.shiftKey && document.activeElement===toggle){
      event.preventDefault();first.focus();
    }else if(event.shiftKey && document.activeElement===toggle){
      event.preventDefault();last.focus();
    }
  });
  media.addEventListener?.("change",syncMenu);
  syncMenu();

  // Firebase may be slow or blocked. The public menu should still work.
  // Keep account-only links hidden until authentication is verified.
  void attachAccountVisibility(special);
}
async function attachAccountVisibility(special){
  if(!special.profile && !special.admin)return;
  try {
    const [{auth},{watchStaffRole},{onAuthStateChanged}] = await Promise.all([
      import("./firebase.js"),
      import("./staff-auth.js"),
      import("https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js")
    ]);
    if(special.profile){
      onAuthStateChanged(auth,user=>{
        special.profile.hidden=!user;
        if(!user && special.admin)special.admin.hidden=true;
      });
    }
    if(special.admin){
      watchStaffRole(allowed=>{
        special.admin.hidden=allowed!==true;
      });
    }
  } catch(error){
    console.warn("Account links unavailable until sign-in initializes:",error);
    if(special.profile)special.profile.hidden=true;
    if(special.admin)special.admin.hidden=true;
  }
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
else init();
