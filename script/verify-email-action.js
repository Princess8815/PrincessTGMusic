import {auth} from "./firebase.js";
import {checkActionCode,applyActionCode} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
const title=document.getElementById("verify-title"),status=document.getElementById("verify-status"),button=document.getElementById("verify-confirm");
const code=new URLSearchParams(location.hash.slice(1)).get("oobCode");
history.replaceState(null,"",location.pathname);
function fail(error){
 title.textContent="Verification unavailable";
 status.textContent=["auth/expired-action-code","auth/invalid-action-code"].includes(error?.code)
 ? "This link has expired or already been used. If needed, request a new email from your account."
 : "We could not verify this email. Return to your account and try a new verification link.";
 button.hidden=true;
}
async function verify(){
 button.disabled=true;button.hidden=true;status.textContent="Confirming with Firebase…";
 try{
  await applyActionCode(auth,code);
  title.textContent="Email verified!";
  status.textContent="Your email is verified! Return to your original website tab and refresh the page to unlock member features, or use the button below.";
  // Only a signal: receiving tabs must reload Firebase to confirm actual access.
  try{localStorage.setItem("princesstg:verification-complete",String(Date.now()));}catch{}
 }catch(error){fail(error);}
}
(async()=>{
 try{
  if(!code)throw Error("Missing code");
  const info=await checkActionCode(auth,code);
  if(info.operation!=="VERIFY_EMAIL")throw Error("Wrong action type");
  await auth.authStateReady();
  // Same signed-in account: one click. Signed-out browsers and mail scanners
  // must explicitly confirm rather than consume the link just by loading it.
  if(auth.currentUser?.email===info.data.email&&auth.currentUser?.emailVerified!==true)await verify();
  else{
   title.textContent="Confirm your email";
   status.textContent="Select Verify my email to finish verifying this address.";
   button.hidden=false;button.addEventListener("click",()=>void verify(),{once:true});
  }
 }catch(error){fail(error);}
})();
