import {accessToken,verifyFirebaseIdentity} from "./rewards.js";
import {MAX_LEVEL,defaultMilestones,validateMilestones,validateDesign,proceduralDesign,initialBoard,settleLight,applyMove,shinyChance,fruiterChance,BANANA_TROPHY} from "../../script/shiny-light-core.mjs";
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const str=stringValue=>({stringValue}),num=n=>({integerValue:String(n)});
const get=(d,k)=>d?.fields?.[k]?.stringValue;
const unpack=d=>d?JSON.parse(get(d,"payload")):null;
const pre=d=>d?{updateTime:d.updateTime}:{exists:false};
const levelOK=n=>Number.isInteger(n)&&n>=1&&n<=MAX_LEVEL;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const random=()=>(crypto.getRandomValues(new Uint32Array(1))[0]+.5)/4294967296;
const active=d=>d?.updateTime&&(get(d,"status")||"active")==="active"&&get(d,"role")!=="banned";
const write=(root,path,data,old)=>({update:{name:root+"/"+path,fields:{payload:str(JSON.stringify(data))}},currentDocument:pre(old)});
async function schedule(read){const d=await read("shinyLightConfig/milestones");return d?validateMilestones(unpack(d)):defaultMilestones();}
async function getMap(read,level){
 const [milestones,official]=await Promise.all([schedule(read),read("shinyLightLevels/"+level)]);
 // A staff schedule change does not silently replace an existing official map.
 // Return an actionable error until staff updates the incompatible design.
 return official?validateDesign(unpack(official),level,milestones):proceduralDesign(level,milestones);
}
async function startLevel(read,state,level){
 state.level=level;state.map=await getMap(read,level);state.board=initialBoard(state.map);
 const first=settleLight(state.map,state.board);state.board=first.board;
 state.won=false;state.stars=[];state.lastBlack=!!first.black;
 return state;
}
function view(state){
 if(state.lastBlack)return {black:true,won:false,stars:[],coin:false,fruit:[],edges:[],lit:[]};
 const {board,...v}=settleLight(state.map,state.board);
 return v;
}
function response(state,wallet,extra={}){
 return {state,wallet,view:extra.view??view(state),coins:0,rewards:[],...extra};
}
export async function shinyGameAction({read,commit,root,uid,input,rng=random,clock=Date.now}){
 const kind=input?.kind;
 if(!["state","check","rotate","move","retry","next","selectLevel","resetCampaign","levels"].includes(kind))fail("Unknown puzzle action.");
 if(kind==="levels"&&(!Number.isInteger(input.page)||input.page<0||input.page>Math.floor((MAX_LEVEL-1)/30)))fail("Invalid level page.");
 if(!["state","levels"].includes(kind)&&(!uuid.test(input.requestId||"")||!Number.isSafeInteger(input.revision)||input.revision<0))fail("Refresh your game first.");
 const user="users/"+uid,path=user+"/privateGames/shinyLight",walletPath=user+"/wallets/starCoins";
 const history=level=>user+"/shinyLightHistory/"+level;
 for(let attempt=0;attempt<4;attempt++){
  const [account,recordDoc,walletDoc]=await Promise.all([read(user),read(path),read(walletPath)]);
  if(!active(account))fail("An active verified account is required.",403);
  const record=unpack(recordDoc),wallet=Number(walletDoc?.fields?.balance?.integerValue||0);
  if(!Number.isSafeInteger(wallet)||wallet<0)fail("Wallet unavailable.",503);
  if(kind==="levels"){
   if(!record)fail("Load your game first.",409);
   const first=input.page*30+1,unlocked=Math.min(MAX_LEVEL,record.state.cleared+1);
   const levels=await Promise.all(Array.from({length:Math.max(0,Math.min(30,unlocked-first+1))},async(_,i)=>{
    const level=first+i,h=unpack(await read(history(level)));
    return {level,stars:h?.generation===record.state.generation?h.stars:0};
   }));
   return {levels,unlocked,totalStars:record.state.totalStars};
  }
  if(record&&kind==="state"){
   if(Math.max(record.state.cleared||0,record.state.highestEverCleared||0)>=1000&&!record.state.bananaTrophyAwarded){
    const trophy=user+"/trophies/"+BANANA_TROPHY[0],owned=await read(trophy);
    const next={...record,state:{...record.state,bananaTrophyAwarded:true}};
    const writes=[{verify:root+"/"+user,currentDocument:pre(account)},write(root,path,next,recordDoc)];
    if(!owned)writes.push({update:{name:root+"/"+trophy,fields:{source:str("shiny-light"),foundAt:{timestampValue:new Date(clock()).toISOString()}}},currentDocument:{exists:false}});
    if(!await commit(writes))continue;
    return response(next.state,wallet,{rewards:owned?[]:[BANANA_TROPHY[0]]});
   }
   return response(record.state,wallet);
  }
  if(!record&&kind!=="state")fail("Load your game first.",409);
  if(record&&record.lastRequest===input.requestId)return response(record.state,wallet,record.lastResult);
  if(record&&record.state.revision!==input.revision)return response(record.state,wallet,{conflict:true,message:"Game changed in another tab. Review the board."});
  const state=record?structuredClone(record.state):await startLevel(read,{revision:0,cleared:0,totalStars:0,generation:0},1);
  let coins=0,rewards=[],message="Ready.",historyWrite=null,rendered=null;
  if(kind==="retry"){
   const first=settleLight(state.map,initialBoard(state.map));state.board=first.board;state.won=false;state.stars=[];state.lastBlack=!!first.black;message="Level reset.";
  }else if(kind==="resetCampaign"){
   state.highestEverCleared=Math.max(state.highestEverCleared||0,state.cleared||0);state.cleared=0;state.totalStars=0;state.generation++;await startLevel(read,state,1);message="Campaign and stars reset. Wallet and previously earned collectibles kept.";
  }else if(kind==="next"||kind==="selectLevel"){
   const target=kind==="next"?state.level+1:input.level;
   if(kind==="next"&&!state.won)fail("Illuminate every banana first.");
   if(!levelOK(target)||target>state.cleared+1)fail("Level is locked.");
   await startLevel(read,state,target);message="Level "+target+" ready.";
  }else if(kind!=="state"){
   if(state.won)fail("Replay or continue to the next level.");
   let result;try{result=applyMove(state.map,state.board,input);}catch(e){fail(e.message);}
   state.board=result.board;state.lastBlack=!!result.black;
   const {board,...visual}=result;rendered=visual;
   if(result.black){state.won=false;state.stars=[];message="Black hole! Level reset.";}
   else if(result.unstable){message="The beam circuit is unstable. Change a mirror or reset.";}
   else{
    state.stars=result.stars;state.won=result.won;
    if(result.coin||result.won){
     const hp=history(state.level),old=await read(hp),prior=unpack(old)||{},h={cleared:!!prior.cleared,coin:!!prior.coin,generation:state.generation,stars:prior.generation===state.generation?(prior.stars||0):0};
     if(result.coin&&!h.coin){coins++;h.coin=true;}
     if(result.won){
      state.cleared=Math.max(state.cleared,state.level);state.highestEverCleared=Math.max(state.highestEverCleared||0,state.cleared);
      const best=Math.max(h.stars,result.stars.length);state.totalStars+=best-h.stars;h.stars=best;
      if(!h.cleared){
       h.cleared=true;coins+=10;
       for(const [id,chance] of [["shiny",shinyChance(state.level)],["fruiter",fruiterChance(state.level)]])
        if(chance>0&&rng()<chance&&!await read(user+"/axolotls/"+id))rewards.push(id);
      }
     }
     if(JSON.stringify(prior)!==JSON.stringify(h))historyWrite=write(root,hp,h,old);
    }
    message=result.won?"All bananas illuminated!":result.fruit.length+" bananas illuminated.";
    if(coins)message+=" +"+coins+" Star Coins.";
   }
  }
  if(Math.max(state.highestEverCleared||0,state.cleared||0)>=1000&&!state.bananaTrophyAwarded){
   if(!await read(user+"/trophies/"+BANANA_TROPHY[0]))rewards.push(BANANA_TROPHY[0]);
   state.bananaTrophyAwarded=true;
  }
  if(kind!=="state")state.revision++;
  const lastResult={coins,rewards,message},writes=[
   {verify:root+"/"+user,currentDocument:pre(account)},
   write(root,path,{state,lastRequest:input.requestId||null,lastResult},recordDoc)
  ];
  if(historyWrite)writes.push(historyWrite);
  if(coins){if(!Number.isSafeInteger(wallet+coins))fail("Wallet limit reached.",503);writes.push({update:{name:root+"/"+walletPath,fields:{currency:str("starCoins"),balance:num(wallet+coins)}},updateMask:{fieldPaths:["currency","balance"]},currentDocument:pre(walletDoc)});}
  for(const id of rewards)writes.push({update:{name:root+"/"+user+"/"+(id===BANANA_TROPHY[0]?"trophies":"axolotls")+"/"+id,fields:{source:str("shiny-light"),foundAt:{timestampValue:new Date(clock()).toISOString()}}},currentDocument:{exists:false}});
  if(await commit(writes))return response(state,wallet+coins,{...lastResult,...(rendered?{view:rendered}:{})});
 }
 fail("Game changed during save. Retry the same action.",409);
}
export async function shinyEditorAction({read,commit,root,uid,input,list,makeId=()=>crypto.randomUUID(),clock=Date.now}){
 const action=input?.action;
 if(!["config","load","browse","loadCommunity","saveCommunity","deleteCommunity","publish","promote","delete","milestones"].includes(action))fail("Unknown editor action.");
 const publicAction=["config","load","browse","loadCommunity"].includes(action);
 let account=null,staff=false;
 if(!publicAction){
  if(!uid)fail("Sign in to save community maps.",401);
  account=await read("users/"+uid);
  if(!active(account))fail("Active verified account required.",403);
  staff=["owner","admin"].includes(get(account,"role"));
  if(["publish","promote","delete","milestones"].includes(action)&&!staff)fail("Administrator access required.",403);
 }
 if(action==="config")return {milestones:await schedule(read)};
 if(action==="load"){
  if(!levelOK(input.level))fail("Invalid level.");
  const [milestones,doc]=await Promise.all([schedule(read),read("shinyLightLevels/"+input.level)]);
  return {design:doc?validateDesign(unpack(doc),input.level,milestones,false):proceduralDesign(input.level,milestones),official:!!doc,milestones};
 }
 if(action==="browse"){
  const result=await list("shinyLightCommunityLevels",typeof input.cursor==="string"?input.cursor.slice(0,1000):"");
  return {levels:result.documents.map(d=>({id:d.name.split("/").at(-1),title:get(d,"title")||"Banana puzzle"})),cursor:result.nextPageToken||null};
 }
 if(action==="loadCommunity"){
  if(!uuid.test(input.id||""))fail("Invalid community level ID.");
  const d=await read("shinyLightCommunityLevels/"+input.id);
  if(!d)fail("Community level not found.",404);
  return {id:input.id,design:validateDesign(unpack(d),1,defaultMilestones(),false),authorUid:get(d,"authorUid")};
 }
 let path,old,writes=[{verify:root+"/users/"+uid,currentDocument:pre(account)}],id=null;
 if(action==="saveCommunity"||action==="deleteCommunity"){
  id=input.id||makeId();if(!uuid.test(id))fail("Invalid community level ID.");
  path="shinyLightCommunityLevels/"+id;old=await read(path);
  if(old&&get(old,"authorUid")!==uid&&!staff)fail("You can only edit your own levels. Save a new copy instead.",403);
  if(action==="deleteCommunity"){
   if(!old)fail("Community level not found.",404);
   writes.push({delete:root+"/"+path,currentDocument:pre(old)});
  }else{
   const design=validateDesign(input.design,1,defaultMilestones(),false);
   writes.push({update:{name:root+"/"+path,fields:{payload:str(JSON.stringify(design)),title:str(design.title),authorUid:str(old?get(old,"authorUid"):uid),updatedAt:{timestampValue:new Date(clock()).toISOString()}}},currentDocument:pre(old)});
  }
 }else if(action==="milestones"){
  path="shinyLightConfig/milestones";old=await read(path);
  writes.push(write(root,path,validateMilestones(input.milestones),old));
 }else{
  if(!levelOK(input.level))fail("Invalid level.");
  path="shinyLightLevels/"+input.level;old=await read(path);
  if(action==="delete"){
   if(!old)return {ok:true};writes.push({delete:root+"/"+path,currentDocument:pre(old)});
  }else{
   const cfg=await read("shinyLightConfig/milestones"),milestones=cfg?validateMilestones(unpack(cfg)):defaultMilestones();
   let raw=input.design,author=uid,sourceId=null;
   if(action==="promote"){
    if(!uuid.test(input.id||""))fail("Select a saved community map.");
    sourceId=input.id;const sourcePath="shinyLightCommunityLevels/"+sourceId,source=await read(sourcePath);
    if(!source)fail("Community level not found.",404);
    raw=unpack(source);author=get(source,"authorUid")||uid;
    writes.push({verify:root+"/"+sourcePath,currentDocument:pre(source)});
   }else if(old){author=get(old,"authorUid")||uid;sourceId=get(old,"sourceCommunityId")||null;}
   const design=validateDesign(raw,input.level,milestones);
   writes.push({verify:root+"/shinyLightConfig/milestones",currentDocument:pre(cfg)},
    {update:{name:root+"/"+path,fields:{payload:str(JSON.stringify(design)),title:str(design.title),authorUid:str(author),publishedBy:str(uid),...(sourceId?{sourceCommunityId:str(sourceId)}:{}),updatedAt:{timestampValue:new Date(clock()).toISOString()}}},currentDocument:pre(old)});
  }
 }
 if(!await commit(writes))fail("Level changed during save. Reload and retry.",409);
 return {ok:true,id};
}
export async function shinyService(env,input,editor=false){
 if(env.STORE_MODE!=="live"||!env.FIREBASE_PROJECT||env.REWARD_FIREBASE_PROJECT!==env.FIREBASE_PROJECT)fail("Puzzle service unavailable.",503);
 const publicAction=editor&&["config","load","browse","loadCommunity"].includes(input?.action);
 const uid=publicAction?null:await verifyFirebaseIdentity(env.FIREBASE_PROJECT,input?.idToken,true),token=await accessToken(env,env.FIREBASE_PROJECT);
 const root="projects/"+env.FIREBASE_PROJECT+"/databases/(default)/documents",url="https://firestore.googleapis.com/v1/"+root,headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};
 const read=async p=>{const r=await fetch(url+"/"+p.split("/").map(encodeURIComponent).join("/"),{headers});if(r.status===404)return null;if(!r.ok)fail("Puzzle storage unavailable.",503);return r.json();};
 const commit=async writes=>{const r=await fetch(url+":commit",{method:"POST",headers,body:JSON.stringify({writes})});if(r.ok)return true;const e=await r.json().catch(()=>({}));if([409,412].includes(r.status)||["ABORTED","FAILED_PRECONDITION","ALREADY_EXISTS"].includes(e.error?.status))return false;fail("Puzzle save not confirmed. Retry the same action.",503);};
 const list=async(p,cursor)=>{const q=new URLSearchParams({pageSize:"20","mask.fieldPaths":"title"});if(cursor)q.set("pageToken",cursor);const r=await fetch(url+"/"+p+"?"+q,{headers});if(!r.ok)fail("Community levels unavailable.",503);const d=await r.json();return {...d,documents:d.documents||[]};};
 try{return await (editor?shinyEditorAction:shinyGameAction)({read,commit,root,uid,input,list});}catch(e){if(e.status)throw e;throw Object.assign(Error(e.message),{status:400});}
}
