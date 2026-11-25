export function isActiveOwner(account){
 return !!account&&account.role==="owner"&&(!Object.hasOwn(account,"status")||account.status==="active");
}
