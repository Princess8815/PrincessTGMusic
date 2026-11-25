import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {publicError} from "../script/site-errors.js";

const source=(await readFile(new URL("../script/reef-collection.js",import.meta.url),"utf8"))
 .replace(/^import .*$/gm,"").replace(/\bexport /g,"").replace(/import\.meta\.url/g,'"https://site.test/script/reef-collection.js"');
function setup(user){
 const saved=new Set(),storage=new Map(),callbacks=[];
 let denied=false,createdElements=0;
 const auth={currentUser:user,authStateReady:async()=>{}};
 const path=(base,...parts)=>({path:[base?.path,...parts].filter(Boolean).join("/")});
 const document={createElement(){createdElements++;return {};}};
 const transaction=async(db,action)=>{
  if(denied)throw Object.assign(Error("Firebase internal write rejection"),{code:"permission-denied"});
  const writes=[];
  const result=await action({get:async ref=>({exists:()=>saved.has(ref.path)}),set:ref=>writes.push(ref.path)});
  for(const key of writes)saved.add(key);
  return result;
 };
 const factory=new Function("auth","db","onAuthStateChanged","collection","doc","runTransaction","serverTimestamp","onSnapshot","getDocsFromServer","writeBatch","getDocFromServer","HOME_REEF","homeReefPortrait","localStorage","window","document","setTimeout","clearTimeout","publicError",source+
  '\nreturn {discoverAxolotl,claimPendingAxolotls,isAxolotlConfirmed,axolotlPortrait};');
 const reef=factory(auth,{},(auth,fn)=>{callbacks.push(fn);fn(auth.currentUser);},path,path,transaction,()=>1,()=>{},async()=>({empty:true}),()=>{},async()=>({exists:()=>true}),[],()=>"",{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},{addEventListener(){},dispatchEvent(){}},document,()=>1,()=>{},publicError);
 return {reef,saved,storage,setDenied(value){denied=value;},login(user){auth.currentUser=user;for(const fn of callbacks)fn(user);},created:()=>createdElements};
}
const account=setup({uid:"alice"});
assert.equal(await account.reef.discoverAxolotl("shelly"),"saved");
assert.ok(account.saved.has("users/alice/axolotls/shelly"));
assert.equal(await account.reef.discoverAxolotl("shelly"),"saved");
assert.equal(account.saved.size,1,"A repeat visit does not create another discovery");
assert.ok(account.reef.axolotlPortrait("shelly").includes("<svg"));
assert.equal(account.created(),0,"Saving a discovery creates no toast or collection announcement");
assert.equal(await account.reef.discoverAxolotl("tide"),"blocked","Purchase eligibility is unchanged");

const guest=setup(null);
assert.equal(await guest.reef.discoverAxolotl("shelly"),"guest");
assert.equal(guest.saved.size,0);
guest.login({uid:"alice"});await guest.reef.claimPendingAxolotls();
assert.ok(guest.saved.has("users/alice/axolotls/shelly"),"Guest discoveries still save after sign-in");
guest.login({uid:"bob"});await guest.reef.claimPendingAxolotls();
assert.ok(!guest.saved.has("users/bob/axolotls/shelly"),"A claimed guest discovery does not follow another account");

const retry=setup({uid:"alice"});retry.setDenied(true);
assert.equal(await retry.reef.discoverAxolotl("shelly"),"pending");
assert.equal(retry.reef.isAxolotlConfirmed("shelly"),false);
assert.ok(retry.storage.size>0,"Failed saves retain the pending discovery");
retry.setDenied(false);await retry.reef.claimPendingAxolotls();
assert.equal(retry.reef.isAxolotlConfirmed("shelly"),true);
assert.equal(retry.created(),0);
console.log("Quiet collection saves, guest claims and retries passed");
