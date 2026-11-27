// Public AdSense identifiers. No provider code is loaded in this test-only phase.
export const AD_CLIENT="ca-pub-9671323559975419";
export const AD_SLOT="8870216368";
export const PRODUCTION_ORIGIN="https://princesstgcreations.pages.dev";
// A route must be deliberately opted in. Sensitive or utility pages never inherit
// a banner by accident. One in-flow placement per route, never sticky.
const groups={
 "home":["/"],
 "browse":["/audioPlayer","/albums","/arts/artsLanding","/pages/poems-home","/pages/releases","/pages/about-the-author","/pages/fruity-paradice","/pages/roadmap"],
 "content":["/audioPlayer/pages/song","/albums/album","/albums/braking-the-roolz","/albums/empowerment","/albums/fight-for-love","/albums/fire-and-peace","/albums/god-s-love","/albums/hope","/albums/moving-on","/albums/music-from-the-year","/albums/pride","/arts/herobrine/chapter1","/arts/herobrine/chapter2","/arts/herobrine/chapter3"],
 "game":["/pages/apple-catcher","/pages/cherry-empire","/pages/giving-tree","/pages/hanggirl","/pages/orange-knock-down","/pages/peach-panic","/pages/shiny-light"],
 "shop":["/pages/store","/pages/membership-store","/pages/star-coin-store","/pages/starlight-store"],
 "challenge":["/pages/challenges","/pages/accidental-songwriters-challenge"]
};
export const BANNER_PATHS=Object.freeze(Object.values(groups).flat());
const routeMap=new Map(Object.entries(groups).flatMap(([placement,paths])=>paths.map(path=>[path,placement])));
export function bannerPlacement(pathname){
 const path=pathname.replace(/^\/PrincessTGMusic(?=\/|$)/i,"").replace(/\/index(?:\.html)?$/i,"/").replace(/\.html$/i,"").replace(/\/$/,"")||"/";
 return routeMap.get(path)||routeMap.get(path.toLowerCase())||null;
}
export const bannerPage=path=>bannerPlacement(path)!==null;
export const bannerSuppressed=({placement,transaction=false,dialog=false,formActive=false})=>dialog||(placement==="shop"&&transaction)||(placement==="challenge"&&formActive);
// Live pages show a placeholder only to staff deliberately using Free view.
// Previews may also demonstrate guest/ordinary Free behavior. Unknown membership
// always hides the banner; the real ad provider is not called in either mode.
export function showTestBanner({origin,path,state,status}){
 if(!bannerPage(path)||!state)return false;
 const live=origin===PRODUCTION_ORIGIN;
 if(!state.uid)return !live;
 return state.ready===true&&status==="free"&&(!live||state.staff===true);
}
export const showAdminTestBanner=(state,status)=>state?.ready===true&&state.staff===true&&status==="free";

// A modal may be nested inside a hidden wrapper (the site's auth dialog is).
// Match actual rendered visibility, not just a dialog node's own hidden flag.
export function renderedElement(el){
 return !!el&&!el.hidden&&!el.closest("[hidden], [aria-hidden='true']")&&el.getClientRects().length>0;
}
export function hasVisibleDialog(root){
 return Array.from(root.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"]')).some(renderedElement);
}
