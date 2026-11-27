import {memberStatus} from "./digital-packs-core.mjs";
export const STAFF_MEMBERSHIP_MODES=["actual","paid","free"];
export const activeMembershipStaff=account=>!!account&&["admin","owner"].includes(account.role)&&(account.status??"active")==="active";
export const membershipOverrideCollection=(mode,emulator=false)=>mode==="live"||emulator?"staffMembershipOverrides":"staffTestMembershipOverrides";
export function effectiveMembership(expiresAt,override,staff,now=Date.now()){
 const actual=memberStatus(expiresAt,now),mode=staff&&STAFF_MEMBERSHIP_MODES.includes(override)?override:"actual";
 return {...actual,status:mode==="actual"?actual.status:mode,actualStatus:actual.status,override:mode};
}
export function toggleMembership(m){return m.status==="paid"?"free":"paid";}
