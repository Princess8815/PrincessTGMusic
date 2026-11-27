import {auth,db,usingLocalFirebaseEmulators} from "./firebase.js";
import {doc,onSnapshot,getDocFromServer,setDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {isActiveOwner} from "./owner-access.js";
import {configId,DEFAULT_AD_SETTINGS,validateAdSettings} from "./ad-settings-core.mjs";
export const adConfigId=()=>usingLocalFirebaseEmulators?"preview":configId(location.origin);
const ref=()=>doc(db,"advertisementSettings",adConfigId());
export function watchAdSettings(callback){
 return onSnapshot(ref(),{includeMetadataChanges:true},snap=>{
  if(snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;
  try{callback({ready:true,settings:validateAdSettings(snap.exists()?snap.data():DEFAULT_AD_SETTINGS),exists:snap.exists()});}
  catch(error){callback({ready:false,error:error.message});}
 },error=>callback({ready:false,error:error.code==="permission-denied"?"Advertisement settings permission denied. Deploy the current Firestore rules.":error.message}));
}
export async function saveAdSettings(settings){
 const user=auth.currentUser;if(!user)throw Error("Sign in as owner.");
 const account=await getDocFromServer(doc(db,"users",user.uid));
 if(auth.currentUser?.uid!==user.uid||!isActiveOwner(account.data()))throw Error("Active owner access required.");
 await setDoc(ref(),{...validateAdSettings(settings),updatedAt:serverTimestamp()});
}
