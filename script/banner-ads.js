import {watchSelfMembership,selfMembership} from "./staff-membership.js";
import {bannerPlacement,showTestBanner,bannerSuppressed} from "./banner-ads-core.mjs";
let started=false;
const active=el=>!!el&&!el.hidden&&!el.closest("[hidden]")&&el.getClientRects().length>0;
export function placeTestBanner(main,banner,placement){
 // Home: between streaming and albums. Browse: below the intro/header,
 // except the music catalog where all player controls remain together.
 if(placement==="home"){
  const albums=main.querySelector(":scope > .albums");
  if(albums){albums.before(banner);return;}
 }
 if(placement==="browse"){
  if(main.classList.contains("audio-app")){
   const catalog=main.querySelector(":scope > .catalog");
   if(catalog){catalog.before(banner);return;}
  }else{
   const header=main.querySelector(":scope > header, :scope > section");
   if(header){header.after(banner);return;}
  }
 }
 // Read/play/game/shop/challenge: below the whole main content; no changes
 // to internal gameplay layout or active form/purchase controls.
 main.after(banner);
}
export function initTestBanner(){
 if(started)return;
 const placement=bannerPlacement(location.pathname);if(!placement)return;
 const main=document.querySelector("body > main");if(!main)return;
 started=true;
 const banner=document.createElement("aside");banner.className="ptg-test-banner ptg-public-test-banner";banner.dataset.placement=placement;banner.hidden=true;banner.setAttribute("aria-label","Simulated advertisement");
 const title=document.createElement("strong");title.textContent="AD HERE";const note=document.createElement("small");note.textContent="Test banner · no real ads";banner.append(title,note);placeTestBanner(main,banner,placement);
 let state=null;
 function render(){
  const status=state?.ready?selfMembership(state).status:null;
  const dialog=!!document.querySelector("dialog[open], [role=dialog][aria-modal=true]:not([hidden])");
  const transaction=placement==="shop"&&(
   ["checkout-panel","payment-panel","receipt-panel","digital-recovery"].some(id=>active(document.getElementById(id)))||
   [...new URLSearchParams(location.search).keys()].some(key=>/checkout|receipt|session|payment|order|success|cancel/i.test(key))
  );
  const formActive=placement==="challenge"&&!!document.activeElement?.closest("form");
  const visible=showTestBanner({origin:location.origin,path:location.pathname,state,status})&&!bannerSuppressed({placement,transaction,dialog,formActive});
  if(banner.hidden===visible)banner.hidden=!visible;
 }
 watchSelfMembership(next=>{state=next;render();});
 // Monitor modal and checkout state without watching rapidly changing game canvases.
 if(placement==="shop"||placement==="challenge"){
  const observer=new MutationObserver(render);
  observer.observe(main,{subtree:true,attributes:true,attributeFilter:["hidden","open","aria-hidden","aria-modal"]});
  document.addEventListener("focusin",render);document.addEventListener("focusout",()=>queueMicrotask(render));
 }
 window.addEventListener("popstate",render);setInterval(render,1000);
}
