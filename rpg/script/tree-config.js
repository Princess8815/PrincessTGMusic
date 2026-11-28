import { applyHardnessOverrides } from "./tree-system.js";
export async function loadTreeDefaults(){
  const r=await fetch(new URL("../json/tree-types.json",import.meta.url));
  if(!r.ok)throw Error("Tree definitions unavailable");
  return r.json();
}
// Firebase is optional for local/offline gameplay. The staff editor saves to the server.
export async function readTreeOverrides(){
  const [{db},{collection,getDocsFromServer}]=await Promise.all([
    import("../../script/firebase.js"),
    import("https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js")
  ]);
  const snapshot=await getDocsFromServer(collection(db,"rpgTreeTypes"));
  return Object.fromEntries(snapshot.docs.map(d=>[d.id,d.data()]));
}
export async function loadTreeTypes(){
  const defaults=await loadTreeDefaults();
  let timer;
  try{
    const overrides=await Promise.race([readTreeOverrides(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("Tree settings timeout")),2500);})]);
    return applyHardnessOverrides(defaults,overrides);
  }catch(e){console.warn("Using default tree hardness.",e);return defaults;}
  finally{clearTimeout(timer);}
}
