import {app, auth, db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {doc, getDocFromServer} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {getFunctions, httpsCallable} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
const fn=httpsCallable(getFunctions(app,"us-central1"),"newsletterAdmin");
const $=id=>document.getElementById(id);
let userId=null;
document.addEventListener("DOMContentLoaded",()=>{
  const block=$("promotions-preference");
  if (!block)return;
  const checkbox=$("promotions-opt-in");
  const status=$("promotions-status");
  onAuthStateChanged(auth,async user=>{
    userId=user?.uid||null;
    block.hidden=!user;
    if(!user)return;
    checkbox.disabled=true;
    try {
      const snap=await getDocFromServer(doc(db,"users",user.uid));
      if (userId!==user.uid)return;
      checkbox.checked=snap.data()?.promotionsSubscribed===true;
      checkbox.disabled=snap.data()?.status==="archived";
      status.textContent="";
    } catch(e) {status.textContent=`Could not load promotion preference: ${e.message}`;}
  });
  checkbox.addEventListener("change",async()=>{
    if(!userId)return;
    const previous=!checkbox.checked;
    checkbox.disabled=true;
    status.textContent="Saving preference...";
    try {
      const {data}=await fn({action:"setPromotionPreference",enabled:checkbox.checked});
      checkbox.checked=data.enabled;
      status.textContent=data.enabled ? "You opted into occasional promotional emails." : "Promotional emails disabled.";
    } catch(e) {
      checkbox.checked=previous;
      status.textContent=`Could not save: ${e.message}`;
    } finally {checkbox.disabled=false;}
  });
});
