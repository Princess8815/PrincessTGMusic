// Age is derived from a date-only UTC birthday, never a stale boolean.
export const TERMS_VERSION="2026-11-26", PRIVACY_VERSION="2026-11-26";
export function ageOnDate(value,now=new Date()){
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const date=new Date(value+"T00:00:00Z");
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value||date.getUTCFullYear()<1900||date>now)return null;
 let age=now.getUTCFullYear()-date.getUTCFullYear();
 if(now.getUTCMonth()<date.getUTCMonth()||(now.getUTCMonth()===date.getUTCMonth()&&now.getUTCDate()<date.getUTCDate()))age--;
 return age;
}
export function ageStatus(value,now=new Date()){
 const age=ageOnDate(value,now);
 return age===null?"Age unknown":age<18?"Under 18":"18+";
}
export function registrationError(value,accepted,now=new Date()){
 const age=ageOnDate(value,now);
 if(age===null)return "Enter a valid date of birth.";
 if(age<13)return "Accounts are available to people age 13 or older.";
 if(!accepted)return "You must agree to the Terms of Service and acknowledge the Privacy Policy.";
 return "";
}
