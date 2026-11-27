// Only trusted server-side documents determine game reward membership.
// Browser previews use their matching staff self-test override. Regular accounts
// always use the real purchased membership; a preview flag cannot grant Paid.
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
// The HTTP router passes the already-allowed Origin separately from JSON input.
export const gameRewardPreview=origin=>!!origin&&origin!=="https://princesstgcreations.pages.dev";
export const GAME_REWARD_REVISION="membership-rewards-v3";
export async function gameRewardContext({read,root,uid,account,clock=Date.now,preview=false}){
 const staff=["admin","owner"].includes(account?.fields?.role?.stringValue);
 const path=(staff?(preview?"staffTestMembershipOverrides/":"staffMembershipOverrides/"):"memberships/")+encodeURIComponent(uid);
 const doc=await read(path);
 const multiplier=rewardMultiplier(account,staff?null:doc,staff?doc:null,clock());
 // A concurrent renewal or staff toggle causes the existing game transaction
 // to retry, rather than crediting a stale membership snapshot.
 const checks=[{verify:root+"/"+path,currentDocument:doc?{updateTime:doc.updateTime}:{exists:false}}];
 return {multiplier,checks,source:staff?(preview?"staffTestMembershipOverrides":"staffMembershipOverrides"):"memberships",environment:preview?"preview":"live",revision:GAME_REWARD_REVISION,membership:multiplier===2?"paid":"free"};
}
export async function gameCoinAward({coins,...ctx}){
 if(coins<=0)return {coins:multiplyGameCoins(coins,1),checks:[]};
 const context=await gameRewardContext(ctx);
 return {...context,coins:multiplyGameCoins(coins,context.multiplier)};
}
export function publicRewardContext({multiplier,source,environment,revision,membership}){
 return {multiplier,source,environment,revision,membership};
}
