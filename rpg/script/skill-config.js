import { defaultSkillSettings,mergeSkillSettings } from "./skills.js";
export async function readSkillOverrides(){
  const [{db},{collection,getDocsFromServer}]=await Promise.all([
    import("../../script/firebase.js"),
    import("https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js")
  ]);
  const snapshot=await getDocsFromServer(collection(db,"rpgSkillSettings"));
  return Object.fromEntries(snapshot.docs.map(d=>[d.id,d.data()]));
}
export async function loadSkillSettings(){
  let timer;
  try{
    const overrides=await Promise.race([readSkillOverrides(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("Skill settings timeout")),2500);})]);
    return mergeSkillSettings(overrides);
  }catch(e){console.warn("Using default skill settings.",e);return defaultSkillSettings();}
  finally{clearTimeout(timer);}
}
