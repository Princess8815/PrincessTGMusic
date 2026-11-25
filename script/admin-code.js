import {auth} from "./firebase.js";
import {watchOwnerRole} from "./staff-auth.js";
import {STORE_WORKER_URL} from "./store-config.js";
import {publicError,siteError,errorCode} from "./site-errors.js";
const $=id=>document.getElementById(id),link=$("admin-owner-code"),content=$("owner-code-content"),status=$("owner-code-status");
let allowed=false,access=null,ownerUid="",epoch=0,commands=[],loaded=false,loading=false,checking=false;
const element=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
const current=version=>version===epoch&&!!ownerUid&&auth.currentUser?.uid===ownerUid;
async function request(action){
 const user=auth.currentUser;if(!allowed||!user)throw siteError("PTG-003");
 const version=epoch,idToken=await user.getIdToken();
 // Metadata can temporarily be pending while credentials refresh. The server
 // still verifies the current owner role on every request.
 if(access===false||epoch!==version||auth.currentUser?.uid!==user.uid)throw siteError("PTG-003");
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch(STORE_WORKER_URL+"/owner/terminal-commands",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken,action}),signal:controller.signal});
  let data;try{data=await response.json();}catch{throw siteError("PTG-903");}
  if(!response.ok)throw Object.assign(siteError(data.code||"PTG-903"),{status:response.status});
  return data;
 }finally{clearTimeout(timer);}
}
function render(){
 if(!content)return;
 const list=$("owner-command-list");list.replaceChildren();
 const search=$("owner-command-search").value.trim().toLowerCase(),category=$("owner-command-category").value;
 const shown=commands.filter(item=>(category==="all"||item.category===category)&&[item.title,item.category,item.description,item.command,item.environment].join(" ").toLowerCase().includes(search));
 $("owner-command-count").textContent=shown.length+" of "+commands.length+" commands";
 for(const item of shown){
  const card=element("article");card.className="owner-command-card";
  const head=element("div");head.className="owner-command-head";
  const title=element("div");title.append(element("h3",item.title));
  const meta=element("span",item.category);meta.className="owner-command-meta";title.append(meta);
  if(item.environment){const badge=element("span",item.environment);badge.className="owner-command-environment";title.append(badge);}
  const copy=element("button","Copy");copy.type="button";copy.setAttribute("aria-label","Copy "+item.title);head.append(title,copy);
  const code=element("pre");code.append(element("code",item.command));
  const feedback=element("p");feedback.className="owner-code-copy-status";feedback.setAttribute("role","status");feedback.setAttribute("aria-live","polite");
  copy.addEventListener("click",async()=>{
   const version=epoch;if(!allowed)return;copy.disabled=true;
   try{await navigator.clipboard.writeText(item.command);if(allowed&&version===epoch)feedback.textContent="Copied.";}
   catch(error){if(allowed&&version===epoch)feedback.textContent=publicError(null,"PTG-904");}
   finally{copy.disabled=false;}
  });
  card.append(head,element("p",item.description),code,feedback);list.append(card);
 }
}
async function load(){
 const version=epoch;if(!allowed||!content||loading)return;loading=true;status.textContent="Loading commands…";$("owner-code-retry").hidden=true;
 try{
  const data=await request("list");if(!current(version))return;
  commands=data.commands;loaded=true;const select=$("owner-command-category");select.replaceChildren(new Option("All commands","all"));
  for(const category of [...new Set(commands.map(item=>item.category))])select.append(new Option(category,category));
  content.hidden=!allowed;status.textContent=allowed?"":"Checking owner access…";render();
 }catch(error){if(current(version)){status.textContent=publicError(error,"PTG-903");content.hidden=!allowed;$("owner-code-retry").hidden=false;}}
 finally{if(version===epoch)loading=false;}
}
function showCheckResult(result){
 $("owner-check-status").textContent=result.ok?"TEST response saved. No coins awarded.":publicError(null,result.code||"PTG-711");
 if(!result.ok){
  const detail=result.diagnostic||{};
  $("owner-check-details").textContent=["Step: "+(detail.step||"Owner request"),"Status: "+(detail.status||"Unavailable"),"Reason: "+(detail.reason||result.code||"UNAVAILABLE")].join("\n");
  $("owner-check-details").hidden=false;
 }
 if(allowed)$("owner-check-status").scrollIntoView({block:"nearest"});
}
if(content){
 $("owner-command-search").addEventListener("input",render);$("owner-command-category").addEventListener("change",render);
 $("owner-code-retry").addEventListener("click",load);
 $("owner-survey-check").addEventListener("click",async event=>{
  const version=epoch;if(!allowed||checking)return;checking=true;event.target.disabled=true;event.target.textContent="Checking…";$("owner-check-status").textContent="Checking survey save…";$("owner-check-details").hidden=true;
  try{
   const result=await request("check-survey");if(!current(version))return;
   showCheckResult(result);
  }catch(error){if(current(version))showCheckResult({ok:false,code:errorCode(error,"PTG-903"),diagnostic:{step:"Owner request",status:error.status||"Unavailable",reason:errorCode(error,"PTG-903")}});}
  finally{if(version===epoch){checking=false;event.target.disabled=false;event.target.textContent="Check survey save";}}
 });
}
watchOwnerRole(value=>{
 const uid=auth.currentUser?.uid||"",identityChanged=uid!==ownerUid;
 if(value===true&&allowed&&!identityChanged)return;
 // Hide pending permissions immediately, while preserving the same owner's
 // in-flight result. A real denial or account switch discards it completely.
 if(identityChanged||value===false){
  epoch++;ownerUid=uid;commands=[];loaded=false;loading=false;checking=false;
  if(content){
   $("owner-command-list").replaceChildren();$("owner-check-details").textContent="";$("owner-check-details").hidden=true;$("owner-check-status").textContent="";
   $("owner-survey-check").disabled=false;$("owner-survey-check").textContent="Check survey save";
  }
 }
 access=value;allowed=value===true;if(link)link.hidden=!allowed;
 if(!content)return;
 content.hidden=!allowed||!loaded;
 status.textContent=value===null?"Checking owner access…":allowed?"":publicError(null,"PTG-003");
 if(allowed&&!loaded&&!loading)load();
});
