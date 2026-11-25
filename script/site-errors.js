// Public messages are deliberately separate from service responses and diagnostics.
export const ERROR_LIST=Object.freeze([
 ["PTG-001","Something went wrong.","Try again. Contact support if it continues."],
 ["PTG-002","Connection unavailable.","Check your connection and try again."],
 ["PTG-003","Access unavailable.","Sign in again. Contact support if needed."],
 ["PTG-004","Please wait before trying again.","Try again in a few minutes."],
 ["PTG-005","Your session has expired.","Sign in again."],
 ["PTG-006","Browser storage unavailable.","Allow site storage and retry. Keep a downloaded backup of unsaved work."],
 ["PTG-007","Check the required fields.","Review your entries and try again."],
 ["PTG-008","This item is unavailable.","Refresh the page or choose another item."],
 ["PTG-009","This item changed.","Refresh before trying again. Keep a copy of unsaved edits."],
 ["PTG-101","Sign-in unavailable.","Try again or use another sign-in method."],
 ["PTG-102","Incorrect email or password.","Check your details or reset your password."],
 ["PTG-103","This email already has an account.","Sign in using your existing sign-in method."],
 ["PTG-104","Enter a valid email address.","Check the address and try again."],
 ["PTG-105","Choose a stronger password.","Use a longer password and try again."],
 ["PTG-106","Sign-in window unavailable.","Allow popups, then try signing in again."],
 ["PTG-107","Verification link expired or invalid.","Request a new verification email."],
 ["PTG-108","Verification email unavailable.","Try again later. Check your inbox and spam folder."],
 ["PTG-109","Your email is not verified yet.","Open the verification link, then check again."],
 ["PTG-110","Account update unavailable.","Try again. Contact support if it continues."],
 ["PTG-111","Account closure incomplete.","Sign in and retry, or contact support. Some saved items may already be removed."],
 ["PTG-201","Store temporarily unavailable.","Refresh the store and try again."],
 ["PTG-202","Checkout temporarily unavailable.","Try again later."],
 ["PTG-203","Shipping unavailable.","Check your address or choose another shipping service."],
 ["PTG-204","Order status unavailable.","Check the existing order before paying again."],
 ["PTG-205","Payment form unavailable.","Resume your existing payment or cancel it."],
 ["PTG-206","Payment not completed.","Check order status before trying payment again."],
 ["PTG-207","Card declined.","Check order status, then try another payment method if needed."],
 ["PTG-208","Not enough stock.","Reduce the quantity or remove the item."],
 ["PTG-209","These items need separate orders.","Finish your cart before adding items with different packaging."],
 ["PTG-210","Cart limit reached.","Use up to 10 copies per product, 8 products and 20 items per order."],
 ["PTG-211","Finish your current checkout first.","Complete or cancel the existing order before editing your cart."],
 ["PTG-212","Collectible save unavailable.","Retry from Collections or revisit where you found the axolotl."],
 ["PTG-213","Purchase collectible unavailable.","Retry your claim. Keep your order reference for support."],
 ["PTG-301","Documents unavailable.","Try again. Keep a downloaded backup of your work."],
 ["PTG-302","Document save incomplete.","Retry saving. Download a backup before leaving the page."],
 ["PTG-303","Document could not be opened.","Check the file or sharing link and try again."],
 ["PTG-304","Document sharing unavailable.","Save your document and try again."],
 ["PTG-305","Document export incomplete.","Check the exported file and keep your original document."],
 ["PTG-401","Mail unavailable.","Try again. Check your connection and sign-in."],
 ["PTG-402","Message not sent.","Review the recipient and message, then try again."],
 ["PTG-501","Music unavailable.","Refresh the page and try again."],
 ["PTG-502","Playback unavailable.","Press Play to retry or choose another song."],
 ["PTG-503","Playlist update unavailable.","Try again. Refresh your playlists if needed."],
 ["PTG-601","Journal unavailable.","Try again. Check your connection and sign-in."],
 ["PTG-602","Journal update incomplete.","Retry and confirm your entry was saved."],
 ["PTG-701","Submission unavailable.","Check your entry and try again."],
 ["PTG-702","Content unavailable.","Refresh the page and try again."],
 ["PTG-710","Surveys temporarily unavailable.","Please try again later."],
 ["PTG-711","Survey save not confirmed.","Retry before leaving. Your account can receive the reward only once."],
 ["PTG-712","Survey results unavailable.","Refresh the results and check administrator access."],
 ["PTG-713","Survey download incomplete.","Try Download all again."],
 ["PTG-714","Use a test response in this preview.","Select the testing checkbox. Test responses do not earn coins."],
 ["PTG-715","Answer at least one question.","You may skip any individual question."],
 ["PTG-801","Settings update unavailable.","Review your settings and try again."],
 ["PTG-901","Administrator action unavailable.","Check your entries and try again."],
 ["PTG-902","Some changes could not be saved.","Review the remaining items and retry."]
].map(([code,message,help])=>Object.freeze({code,message,help})));

const entries=new Map(ERROR_LIST.map(item=>[item.code,item]));
const aliases=Object.freeze({
 "auth/invalid-credential":"PTG-102","auth/wrong-password":"PTG-102","auth/user-not-found":"PTG-102",
 "auth/email-already-in-use":"PTG-103","auth/account-exists-with-different-credential":"PTG-103",
 "auth/invalid-email":"PTG-104","auth/missing-email":"PTG-104","auth/weak-password":"PTG-105",
 "auth/popup-blocked":"PTG-106","auth/popup-closed-by-user":"PTG-106","auth/cancelled-popup-request":"PTG-106",
 "auth/invalid-action-code":"PTG-107","auth/expired-action-code":"PTG-107",
 "auth/too-many-requests":"PTG-004","auth/quota-exceeded":"PTG-004","resource-exhausted":"PTG-004",
 "auth/network-request-failed":"PTG-002","unavailable":"PTG-002","deadline-exceeded":"PTG-002",
 "auth/user-token-expired":"PTG-005","auth/requires-recent-login":"PTG-005","auth/account-mismatch":"PTG-005",
 "auth/user-disabled":"PTG-003","permission-denied":"PTG-003","unauthenticated":"PTG-005",
 "not-found":"PTG-008","aborted":"PTG-009","invalid-argument":"PTG-007",
 "card_declined":"PTG-207","expired_card":"PTG-207","incorrect_cvc":"PTG-207",
 "QuotaExceededError":"PTG-006","SecurityError":"PTG-006","AbortError":"PTG-002"
});

export function errorCode(error,fallback="PTG-001"){
 const code=error?.publicCode||error?.code||error?.name;
 if(entries.has(code))return code;
 const alias=typeof code==="string"?code.replace(/^functions\//,""):"";
 if(Object.hasOwn(aliases,alias))return aliases[alias];
 const status=error?.status;
 if(status===401)return "PTG-005";
 if(status===403)return "PTG-003";
 if(status===429)return "PTG-004";
 if(status===409)return "PTG-009";
 return entries.has(fallback)?fallback:"PTG-001";
}

export function publicError(error,fallback="PTG-001"){
 // Already formatted messages can pass through status helpers without duplication.
 if(typeof error==="string"){
  const known=error.match(/\bPTG-\d{3}\b/)?.[0];
  if(entries.has(known))return publicError({publicCode:known});
 }
 const code=errorCode(error,fallback);
 return entries.get(code).message+" ("+code+")";
}

// For authored form validation text. Never pass a service response here.
export function withErrorCode(message,code="PTG-007"){
 if(/\bPTG-\d{3}\b/.test(String(message)))return publicError(message,code);
 return String(message)+" ("+(entries.has(code)?code:"PTG-001")+")";
}

export function siteError(code,cause){
 const error=new Error(publicError(null,code));
 error.publicCode=entries.has(code)?code:"PTG-001";
 if(cause!==undefined)error.cause=cause;
 return error;
}

export function storeError(error,path=""){
 const fallback=path==="/status"?"PTG-204":path==="/claim-reward"?"PTG-213":path==="/catalog"?"PTG-201":path==="/shipping-quotes"?"PTG-203":"PTG-202";
 // Inspect service text only to select an approved message; never display it.
 const detail=String(error?.message||"");
 const code=/stock|inventory|sold out/i.test(detail)?"PTG-208":
  /different packaging|separate orders/i.test(detail)?"PTG-209":
  /address|postal|destination|shipping rate|shipping service|quote expired|quote.*expir/i.test(detail)?"PTG-203":
  /invalid cart|cart is empty|unavailable product|not for sale/i.test(detail)?"PTG-008":
  /timed? ?out|network|failed to fetch/i.test(detail)?"PTG-002":errorCode(error,fallback);
 const result=siteError(code,error);result.status=error?.status;return result;
}
