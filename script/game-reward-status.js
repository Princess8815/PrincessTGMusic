import {auth,usingLocalFirebaseEmulators} from "./firebase.js";
import {watchSelfMembership,selfMembership} from "./staff-membership.js";
export const GAME_REWARD_REVISION="membership-rewards-v3";
const URL="https://princesstg-cd-store-live.transgirl1991.workers.dev/games/hanggirl";
export async function checkGameRewardStatus(user=auth.currentUser){
 if(usingLocalFirebaseEmulators||!user?.emailVerified)throw Error("Sign in with a verified Live Firebase account.");
 const idToken=await user.getIdToken();
 if(auth.currentUser?.uid!==user.uid)throw Error("Account changed.");
 const r=await fetch(URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken,action:"reward-status"})});
 const data=await r.json().catch(()=>({}));
 if(!r.ok||data.revision!==GAME_REWARD_REVISION)throw Error("Game reward Worker is not confirmed up to date. Deploy the current branch's live Worker and retry the check.");
 if(![1,2].includes(data.multiplier)||data.membership!==(data.multiplier===1?"free":"paid"))throw Error("Invalid reward status.");
 if(auth.currentUser?.uid!==user.uid)throw Error("Account changed.");
 return data;
}
export function rewardStatusText(data){return "Game server: "+(data.multiplier===1?"Free · 1× base rewards":"Paid · 2× rewards")+" ("+data.environment+", "+data.source+").";}
export function watchGameRewardAgreement(callback){
 let current=null,server=null,error="",epoch=0,checking=false;
 const publish=()=>{const expected=current?.ready?selfMembership(current).status:null;const matches=!!server&&server.membership===expected;callback({ready:matches&&!checking,checking,server,expected,error:error||(!checking&&server&&expected&&!matches?"Membership mismatch. Check that the toggle and game are on the same site origin.":""),uid:current?.uid});};
 async function refresh(){const user=auth.currentUser,seq=++epoch;server=null;error="";checking=!!user?.emailVerified&&!usingLocalFirebaseEmulators;publish();if(!checking)return;
  try{const result=await checkGameRewardStatus(user);if(seq===epoch)server=result;}catch(e){if(seq===epoch)error=e.message;}finally{if(seq===epoch){checking=false;publish();}}
 }
 let previous="";
 const stop=watchSelfMembership(s=>{current=s;const signature=JSON.stringify([s.uid,s.ready,s.staff,s.override,s.expiresAt,s.error]);if(signature!==previous){previous=signature;void refresh();}else publish();});
 return {refresh,stop};
}
