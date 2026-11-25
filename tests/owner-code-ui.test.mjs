import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {publicError,siteError,errorCode} from "../script/site-errors.js";

// Execute the shipped controller with a small DOM and controllable auth/network
// boundaries so role metadata transitions can race with a real button handler.
const source=(await readFile(new URL("../script/admin-code.js",import.meta.url),"utf8")).replace(/^import[\s\S]*?;\n/gm,"");
class Element{
 constructor(){this.hidden=false;this.disabled=false;this.textContent="";this.value="";this.children=[];this.listeners={};}
 addEventListener(name,callback){this.listeners[name]=callback;}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 setAttribute(){}
 scrollIntoView(){}
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const ids=["admin-owner-code","owner-code-content","owner-code-status","owner-code-retry","owner-command-search","owner-command-category","owner-command-count","owner-command-list","owner-survey-check","owner-check-status","owner-check-details"];
 const nodes=new Map(ids.map(id=>[id,new Element()]));nodes.get("owner-command-category").value="all";
 let watch,refreshNext=false,deferred=null,tokenFailure=null;
 const tokenArgs=[],calls=[];
 const user={uid:"owner-one",getIdToken:async force=>{
  tokenArgs.push(force);
  if(tokenFailure)throw tokenFailure;
  if(refreshNext){refreshNext=false;watch(null);queueMicrotask(()=>watch(true));}
  return "signed-token";
 }};
 const auth={currentUser:user};
 let result={ok:false,code:"PTG-711",diagnostic:{step:"Save answers",status:403,reason:"PERMISSION_DENIED"}};
 const deps={auth,watchOwnerRole:callback=>{watch=callback;callback(false);},STORE_WORKER_URL:"https://worker.test",publicError,siteError,errorCode,document:{getElementById:id=>nodes.get(id),createElement:()=>new Element()},Option:class extends Element{constructor(label,value){super();this.textContent=label;this.value=value;}},navigator:{clipboard:{writeText:async()=>{}}},fetch:async(_,options)=>{
  const action=JSON.parse(options.body).action;calls.push(action);
  if(action==="list")return Response.json({commands:[{id:"deploy",title:"Deploy",description:"From root",category:"Deploy",command:"npx wrangler deploy --config workers/cd-store/wrangler.toml"}]});
  if(deferred)return deferred;
  return Response.json(result);
 }};
 new Function(...Object.keys(deps),source)(...Object.values(deps));
 return {nodes,auth,watch:value=>watch(value),tokenArgs,calls,result:value=>{result=value;},refresh:()=>{refreshNext=true;},failToken:error=>{tokenFailure=error;},defer:()=>{let resolve;deferred=new Promise(done=>{resolve=done;});return ()=>resolve(Response.json(result));},click:()=>nodes.get("owner-survey-check").listeners.click({target:nodes.get("owner-survey-check")})};
}

test("Owner survey check survives role revalidation during token retrieval",async()=>{
 const ui=harness();ui.watch(true);await settle();ui.refresh();await ui.click();await settle();
 assert.equal(ui.nodes.get("owner-check-details").hidden,false);
 assert.match(ui.nodes.get("owner-check-details").textContent,/Save answers\nStatus: 403\nReason: PERMISSION_DENIED/);
 assert.match(ui.nodes.get("owner-check-status").textContent,/PTG-711/);
 assert.equal(ui.nodes.get("owner-survey-check").disabled,false);
 assert.ok(ui.tokenArgs.every(force=>force!==true),"Commands do not force a token refresh for every request");
});
test("A completed check stays hidden during verification and reappears for the same owner",async()=>{
 const ui=harness();ui.watch(true);await settle();const release=ui.defer(),pending=ui.click();await settle();ui.watch(null);release();await pending;
 assert.equal(ui.nodes.get("owner-code-content").hidden,true);
 ui.watch(true);await settle();
 assert.equal(ui.nodes.get("owner-code-content").hidden,false);
 assert.match(ui.nodes.get("owner-check-details").textContent,/PERMISSION_DENIED/);
 assert.equal(ui.calls.filter(action=>action==="list").length,1,"Revalidation preserves the loaded catalog and check result");
});
test("Revoked owners never regain an in-flight result",async()=>{
 const ui=harness();ui.watch(true);await settle();const release=ui.defer(),pending=ui.click();await settle();ui.watch(false);release();await pending;
 assert.equal(ui.nodes.get("owner-code-content").hidden,true);
 assert.equal(ui.nodes.get("owner-check-details").textContent,"");
 assert.equal(ui.nodes.get("owner-command-list").children.length,0);
});
test("Switching accounts discards the previous owner's pending check",async()=>{
 const ui=harness();ui.watch(true);await settle();const release=ui.defer(),pending=ui.click();await settle();ui.auth.currentUser={uid:"owner-two",getIdToken:async()=>"other-token"};ui.watch(null);release();await pending;
 assert.equal(ui.nodes.get("owner-code-content").hidden,true);
 assert.equal(ui.nodes.get("owner-check-details").textContent,"");
 assert.equal(ui.nodes.get("owner-command-list").children.length,0);
});
test("A failed owner request shows a result instead of a blank check",async()=>{
 const ui=harness();ui.watch(true);await settle();ui.failToken(Object.assign(Error("Private sign-in details"),{publicCode:"PTG-005"}));await ui.click();
 assert.match(ui.nodes.get("owner-check-status").textContent,/PTG-005/);
 assert.equal(ui.nodes.get("owner-check-details").hidden,false);
 assert.ok(!ui.nodes.get("owner-check-details").textContent.includes("Private"));
});
test("Successful checks remain visible after role revalidation",async()=>{
 const ui=harness();ui.result({ok:true,isTest:true,awarded:0});ui.watch(true);await settle();ui.refresh();await ui.click();await settle();
 assert.equal(ui.nodes.get("owner-code-content").hidden,false);
 assert.match(ui.nodes.get("owner-check-status").textContent,/TEST response saved\. No coins awarded/);
 assert.equal(ui.nodes.get("owner-check-details").hidden,true);
});
