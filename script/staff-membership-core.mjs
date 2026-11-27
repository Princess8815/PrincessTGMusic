import {memberStatus} from "./digital-packs-core.mjs";
export const STAFF_MEMBERSHIP_MODES=["actual","paid","free"];
export const activeMembershipStaff=account=>!!account&&["admin","owner"].includes(account.role)&&(account.status??"active")==="active";
export const membershipOverrideCollection=(mode,emulator=false)=>mode==="live"||emulator?"staffMembershipOverrides":"staffTestMembershipOverrides";
export function effectiveMembership(expiresAt,override,staff,now=Date.now()){
 const actual=memberStatus(expiresAt,now),freeView=staff===true&&override==="free",complimentary=staff===true&&!freeView;
 return {...actual,status:freeView?"free":complimentary?"paid":actual.status,actualStatus:actual.status,override:freeView?"free":"actual",complimentary};
}
export function toggleMembership(m){return m.override==="free"?"actual":"free";}
