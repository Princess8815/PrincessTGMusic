// Only trusted server-side documents determine game reward membership.
// Preview staff overrides never affect real wallets.
export function rewardMultiplier(account,membership,override,now=Date.now()){
 const role=account?.fields?.role?.stringValue,status=account?.fields?.status?.stringValue??"active";
 if(!account||status!=="active"||role==="banned")return 1;
 if(["admin","owner"].includes(role))return override?.fields?.mode?.stringValue==="free"?1:2;
 const expiry=Date.parse(membership?.fields?.expiresAt?.timestampValue||"");
 return Number.isFinite(expiry)&&expiry>now?2:1;
}
export function multiplyGameCoins(coins,multiplier){
 if(!Number.isSafeInteger(coins)||![1,2].includes(multiplier))throw Error("Invalid game reward.");
 const result=coins>0?coins*multiplier:coins;
 if(!Number.isSafeInteger(result))throw Error("Game reward exceeds supported range.");
 return result;
}
export async function gameCoinAward({read,root,uid,account,coins,clock=Date.now}){
 if(coins<=0)return {coins:multiplyGameCoins(coins,1),checks:[]};
 const staff=["admin","owner"].includes(account?.fields?.role?.stringValue);
 const path=(staff?"staffMembershipOverrides/":"memberships/")+encodeURIComponent(uid);
 const doc=await read(path);
 const multiplier=rewardMultiplier(account,staff?null:doc,staff?doc:null,clock());
 // A concurrent renewal or staff toggle causes the existing game transaction
 // to retry, rather than crediting a stale membership snapshot.
 const checks=[{verify:root+"/"+path,currentDocument:doc?{updateTime:doc.updateTime}:{exists:false}}];
 return {coins:multiplyGameCoins(coins,multiplier),checks};
}
