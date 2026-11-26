import {auth,usingLocalFirebaseEmulators} from "./firebase.js";
export async function editorRequest(action,extra={},write=false){
 const body={action,...extra};
 if(write){if(usingLocalFirebaseEmulators||!auth.currentUser)throw Error("Sign in to Live Firebase to save.");body.idToken=await auth.currentUser.getIdToken();}
 const r=await fetch("https://princesstg-cd-store-live.transgirl1991.workers.dev/games/orange-editor",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error||"Editor unavailable.");return data;
}
