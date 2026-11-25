
import {auth,db,usingLocalFirebaseEmulators} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {collection,doc,onSnapshot,query,where} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {mergeTypes,validImage,validPrice} from "./starlight-model.mjs";
const $=id=>document.getElementById(id),list=$("sl-items"),status=$("sl-status"),endpoint="https://princesstg-cd-store-live.transgirl1991.workers.dev/starlight/buy";
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
let items=[],types=mergeTypes([]),owned=new Set(),balance=null,selected="",loaded=false,busy=false,epoch=0,stops=[],catalogError=false,ownershipReady=false;
function render(){
 const nav=$("sl-categories");nav.replaceChildren();
 const visible=types.filter(t=>items.some(i=>i.typeId===t.id));
 if(selected&&!visible.some(t=>t.id===selected))selected="";
 for(const t of [{id:"",name:"All"},...visible]){const b=el("button",t.name);b.type="button";b.setAttribute("aria-pressed",String(selected===t.id));b.onclick=()=>{selected=t.id;render();};nav.append(b);}
 list.replaceChildren();
 for(const item of items.filter(x=>!selected||x.typeId===selected)){
  if(!validImage(item.image)||!validPrice(item.price))continue;
  const card=el("article");card.className="sl-card";const img=el("img");img.src=item.image;img.alt=item.name;img.loading="lazy";
  const price=el("p",item.price.toLocaleString()+" Star Coin"+(item.price===1?"":"s"));price.className="sl-cost";
  const isOwned=owned.has(item.id),eligible=!!auth.currentUser?.emailVerified&&!usingLocalFirebaseEmulators,ready=balance!==null&&ownershipReady;
  const b=el("button",isOwned?"Owned":!eligible?"Sign in / verify email":!ready?"Checking account…":balance<item.price?"Not enough Star Coins":"Buy collectible");
  b.type="button";b.disabled=busy||isOwned||!eligible||!ready||balance<item.price;b.onclick=()=>buy(item);
  card.append(img,el("h3",item.name),el("p",types.find(t=>t.id===item.typeId)?.name||"Collectible"),price,b);list.append(card);
 }
 if(!busy&&!catalogError&&!status.dataset.purchase)status.textContent=!loaded?"Loading the catalog…":!items.length?"No collectibles listed yet. Check back soon.":"";
}
async function buy(item){
 const user=auth.currentUser;if(!user||busy||owned.has(item.id))return;
 if(!confirm("Buy "+item.name+" for "+item.price.toLocaleString()+" Star Coins?"))return;
 const current=epoch;busy=true;delete status.dataset.purchase;status.textContent="Confirming purchase…";render();
 try{const idToken=await user.getIdToken();if(current!==epoch)return;
  const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken,itemId:item.id,expectedPrice:item.price})});
  const data=await res.json();if(current!==epoch)return;if(!res.ok)throw Error(data.error||"Purchase unavailable.");
  owned.add(item.id);if(Number.isSafeInteger(data.balance))balance=data.balance;
  status.textContent=data.alreadyOwned?"You already own this collectible. No coins charged.":"Purchased "+item.name+"! Added to your collection.";
 }catch(e){if(current===epoch)status.textContent=e.message||"Purchase unavailable. Retry to check ownership.";}
 finally{if(current===epoch){busy=false;status.dataset.purchase="1";render();}}
}
onSnapshot(collection(db,"starlightTypes"),s=>{types=mergeTypes(s.docs.map(d=>({...d.data(),id:d.id})));render();},()=>{});
onSnapshot(query(collection(db,"starlightItems"),where("active","==",true)),s=>{items=s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>a.name.localeCompare(b.name));loaded=true;catalogError=false;render();},()=>{catalogError=true;status.textContent="Catalog unavailable. Check Firestore rules and reload.";});
onAuthStateChanged(auth,user=>{
 const current=++epoch;stops.forEach(s=>s());stops=[];owned=new Set();balance=null;ownershipReady=false;busy=false;delete status.dataset.purchase;
 $("sl-login").hidden=!!user||usingLocalFirebaseEmulators;
 $("sl-member").textContent=usingLocalFirebaseEmulators?"Select Live Firebase in Settings to spend your real Star Coins.":!user?"Sign in to buy collectibles.":!user.emailVerified?"Verify your email before buying.":"Your purchases are saved to your account.";
 render();if(!user||usingLocalFirebaseEmulators)return;
 stops.push(onSnapshot(doc(db,"users",user.uid,"wallets","starCoins"),{includeMetadataChanges:true},s=>{if(current!==epoch||s.metadata.fromCache||s.metadata.hasPendingWrites)return;balance=s.data()?.balance??0;render();},()=>{balance=null;render();}));
 stops.push(onSnapshot(collection(db,"users",user.uid,"starlightCollectibles"),{includeMetadataChanges:true},s=>{if(current!==epoch||s.metadata.fromCache||s.metadata.hasPendingWrites)return;owned=new Set(s.docs.map(d=>d.id));ownershipReady=true;render();},()=>{ownershipReady=false;render();}));
});
$("sl-login").onclick=()=>$("auth-open")?.click();render();
