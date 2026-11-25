import {auth,db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {doc,onSnapshot} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {publicError} from "./site-errors.js";
const wallets=[...document.querySelectorAll("[data-star-wallet]")];
if(wallets.length){
 let stop=()=>{};
 onAuthStateChanged(auth,user=>{
  stop();stop=()=>{};
  for(const wallet of wallets){wallet.hidden=!user;wallet.querySelector("[data-star-balance]").textContent="…";wallet.querySelector("[data-star-status]").textContent="";}
  if(!user)return;
  stop=onSnapshot(doc(db,"users",user.uid,"wallets","starCoins"),snapshot=>{
   if(auth.currentUser?.uid!==user.uid)return;
   const balance=snapshot.data()?.balance??0;
   for(const wallet of wallets){wallet.querySelector("[data-star-balance]").textContent=Number.isSafeInteger(balance)&&balance>=0?balance.toLocaleString():"—";wallet.querySelector("[data-star-status]").textContent="";}
  },error=>{if(auth.currentUser?.uid===user.uid)for(const wallet of wallets){wallet.querySelector("[data-star-balance]").textContent="—";wallet.querySelector("[data-star-status]").textContent=publicError(error,"PTG-710");}});
 });
}
