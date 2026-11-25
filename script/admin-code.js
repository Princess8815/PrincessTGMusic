import {auth} from "./firebase.js";
import {watchOwnerRole} from "./staff-auth.js";
import {STORE_WORKER_URL} from "./store-config.js";
import {publicError,siteError} from "./site-errors.js";
const $=id=>document.getElementById(id),link=$("admin-owner-code"),content=$("owner-code-content"),status=$("owner-code-status");
let allowed=false,epoch=0,commands=[];
const element=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
async function request(action){
 const user=auth.currentUser;if(!allowed||!user)throw siteError("PTG-003");
 const idToken=await user.getIdToken(true);if(!allowed||auth.currentUser?.uid!==user.uid)throw siteError("PTG-003");
 const response=await fetch(STORE_WORKER_URL+"/owner/terminal-commands",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken,action})});
 let data;try{data=await response.json();}catch{throw siteError("PTG-903");}
 if(!response.ok)throw siteError(data.code||"PTG-903");
 return data;
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
 const version=epoch;if(!allowed||!content)return;status.textContent="Loading commands…";$("owner-code-retry").hidden=true;
 try{
  const data=await request("list");if(!allowed||version!==epoch)return;
  commands=data.commands;const select=$("owner-command-category");select.replaceChildren(new Option("All commands","all"));
  for(const category of [...new Set(commands.map(item=>item.category))])select.append(new Option(category,category));
  content.hidden=false;status.textContent="";render();
 }catch(error){if(version===epoch){status.textContent=publicError(error,"PTG-903");content.hidden=false;$("owner-code-retry").hidden=false;}}
}
if(content){
 $("owner-command-search").addEventListener("input",render);$("owner-command-category").addEventListener("change",render);
 $("owner-code-retry").addEventListener("click",load);
 $("owner-survey-check").addEventListener("click",async event=>{
  const version=epoch;if(!allowed)return;event.target.disabled=true;$("owner-check-status").textContent="Checking…";$("owner-check-details").hidden=true;
  try{
   const result=await request("check-survey");if(!allowed||version!==epoch)return;
   $("owner-check-status").textContent=result.ok?"TEST response saved. No coins awarded.":publicError(null,result.code||"PTG-711");
   if(!result.ok){const detail=result.diagnostic||{};$("owner-check-details").textContent=["Step: "+detail.step,"Status: "+detail.status,"Reason: "+detail.reason].join("\n");$("owner-check-details").hidden=false;}
  }catch(error){if(version===epoch)$("owner-check-status").textContent=publicError(error,"PTG-903");}
  finally{event.target.disabled=false;}
 });
}
watchOwnerRole(value=>{
 if(value===true&&allowed)return;
 epoch++;allowed=value===true;if(link)link.hidden=!allowed;
 if(!content)return;
 content.hidden=true;commands=[];$("owner-command-list").replaceChildren();$("owner-check-details").textContent="";$("owner-check-status").textContent="";
 status.textContent=value===null?"Checking owner access…":allowed?"":publicError(null,"PTG-003");
 if(allowed)load();
});
