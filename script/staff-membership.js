import {auth,db,usingLocalFirebaseEmulators} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {doc,onSnapshot,setDoc,serverTimestamp,getDocFromServer} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {digitalMode} from "./digital-packs-api.js";
import {activeMembershipStaff,membershipOverrideCollection,effectiveMembership,STAFF_MEMBERSHIP_MODES} from "./staff-membership-core.mjs";
export const previewMembership=()=>digitalMode()!=="live"&&!usingLocalFirebaseEmulators;
export const overrideCollection=()=>membershipOverrideCollection(digitalMode(),usingLocalFirebaseEmulators);
export function watchSelfMembership(callback){
 let stops=[],epoch=0;
 return onAuthStateChanged(auth,user=>{
  stops.forEach(fn=>fn());stops=[];const generation=++epoch;
  callback({ready:false,uid:user?.uid||null});
  if(!user)return;
  const uid=user.uid,values={},seen=new Set();let failed=false;
  const valid=()=>generation===epoch&&auth.currentUser?.uid===uid;
  const publish=()=>{if(!valid()||failed)return;if(seen.size===3)callback({ready:true,uid,staff:activeMembershipStaff(values.account),expiresAt:values.membership?.expiresAt?.toMillis?.()??null,override:values.override?.mode||"actual"});};
  for(const [key,ref] of [["account",doc(db,"users",uid)],["membership",doc(db,"memberships",uid)],["override",doc(db,overrideCollection(),uid)]]){
   stops.push(onSnapshot(ref,{includeMetadataChanges:true},snap=>{if(!valid()||snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;values[key]=snap.data();seen.add(key);publish();},err=>{if(!valid())return;failed=true;callback({ready:false,uid,error:err.message||"Membership unavailable."});}));
  }
 });
}
export async function setSelfMembership(mode,expectedUid){
 if(!STAFF_MEMBERSHIP_MODES.includes(mode))throw Error("Invalid membership mode.");
 const user=auth.currentUser;if(!user||user.uid!==expectedUid)throw Error("Account changed.");
 const account=await getDocFromServer(doc(db,"users",user.uid));
 if(auth.currentUser?.uid!==expectedUid||!activeMembershipStaff(account.data()))throw Error("Active administrator access required.");
 await setDoc(doc(db,overrideCollection(),user.uid),{mode,updatedAt:serverTimestamp()});
}
export const selfMembership=state=>effectiveMembership(state.expiresAt,state.override,state.staff);
