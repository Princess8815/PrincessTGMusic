// Public AdSense identifiers. No provider code is loaded in this test-only phase.
export const AD_CLIENT="ca-pub-9671323559975419";
export const AD_SLOT="8870216368";
export const PRODUCTION_ORIGIN="https://princesstgcreations.pages.dev";
export const BANNER_PATHS=["/","/audioPlayer","/albums","/arts/artsLanding","/pages/poems-home","/pages/releases","/pages/about-the-author","/pages/fruity-paradice"];
export function bannerPage(pathname){
 const path=pathname.replace(/^\/PrincessTGMusic(?=\/|$)/,"").replace(/\/index(?:\.html)?$/,"/").replace(/\.html$/,"").replace(/\/$/,"")||"/";
 return BANNER_PATHS.includes(path);
}
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
