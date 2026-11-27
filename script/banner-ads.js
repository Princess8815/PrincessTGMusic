import {watchSelfMembership,selfMembership} from "./staff-membership.js";
import {bannerPage,showTestBanner} from "./banner-ads-core.mjs";
let started=false;
export function initTestBanner(){
 if(started||!bannerPage(location.pathname))return;
 const main=document.querySelector("body > main");if(!main)return;
 started=true;
 const banner=document.createElement("aside");banner.className="ptg-test-banner ptg-public-test-banner";banner.hidden=true;banner.setAttribute("aria-label","Simulated advertisement");
 const title=document.createElement("strong");title.textContent="AD HERE";const note=document.createElement("small");note.textContent="Test banner · no real ads";banner.append(title,note);main.before(banner);
 let state=null;
 function render(){const status=state?.ready?selfMembership(state).status:null;banner.hidden=!showTestBanner({origin:location.origin,path:location.pathname,state,status});}
 watchSelfMembership(next=>{state=next;render();});
 setInterval(render,1000);
}
