import {watchSelfMembership,selfMembership} from "./staff-membership.js";
import {bannerPlacement,showTestBanner,bannerSuppressed,renderedElement,hasVisibleDialog,placeTestBanner} from "./banner-ads-core.mjs";
let started=false;
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
  const dialog=hasVisibleDialog(document);
  const transaction=placement==="shop"&&(
   ["checkout-panel","payment-panel","receipt-panel","digital-recovery"].some(id=>renderedElement(document.getElementById(id)))||
   [...new URLSearchParams(location.search).keys()].some(key=>/checkout|receipt|session|payment|order|success|cancel/i.test(key))
  );
  const formActive=placement==="challenge"&&!!document.activeElement?.closest("form");
  const visible=showTestBanner({origin:location.origin,path:location.pathname,state,status})&&!bannerSuppressed({placement,transaction,dialog,formActive});
  const reason=visible?"visible":!state?"checking-auth":state.error?"membership-error":state.uid&&!state.ready?"checking-membership":dialog?"dialog-open":transaction?"checkout-active":formActive?"form-active":status==="paid"?"paid":"not-eligible";
  if(banner.dataset.state!==reason){banner.dataset.state=reason;console.info("[PTG test banner]",reason);}
  if(banner.hidden===visible)banner.hidden=!visible;
 }
 watchSelfMembership(next=>{state=next;render();});
 // Observe the shared auth wrapper separately; it lives outside the main area.
 const authRoot=document.getElementById("auth-container");
 if(authRoot){const authObserver=new MutationObserver(render);authObserver.observe(authRoot,{subtree:true,childList:true,attributes:true,attributeFilter:["hidden","open","aria-hidden","aria-modal"]});}
 // Monitor modal and checkout state without watching rapidly changing game canvases.
 if(placement==="shop"||placement==="challenge"){
  const observer=new MutationObserver(render);
  observer.observe(main,{subtree:true,attributes:true,attributeFilter:["hidden","open","aria-hidden","aria-modal"]});
  document.addEventListener("focusin",render);document.addEventListener("focusout",()=>queueMicrotask(render));
 }
 window.addEventListener("popstate",render);setInterval(render,1000);
}

export function startTestBanner(){
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initTestBanner,{once:true});
 else initTestBanner();
}
