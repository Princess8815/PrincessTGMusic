import {publicError,withErrorCode} from "./site-errors.js";
import {ageStatus} from "./account-registration.mjs";
import {effectiveMembership,activeMembershipStaff} from "./staff-membership-core.mjs";

import { auth, db, usingLocalFirebaseEmulators } from "./firebase.js";

import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  updateDoc,
  serverTimestamp,
  Timestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", async () => {
  const $ = id => document.getElementById(id);

  const section = $("account-management");
  const search = $("account-search");
  const results = $("account-results");
  const searchStatus = $("account-search-status");

  const editor = $("account-editor");
  const selectedName = $("account-selected-name");
  const selectedEmail = $("account-selected-email");
  const currentStatus = $("account-current-status");

  const roleSelect = $("account-role");
  const banSettings = $("account-ban-settings");
  const banDuration = $("account-ban-duration");
  const customBan = $("account-custom-ban");
  const customEnd = $("account-ban-end");

  const saveButton = $("account-save");
  const saveStatus = $("account-save-status");
  const refreshButton = $("account-refresh");
  const verificationTab=$("account-subtab-verification");
  const verificationStatus=$("account-verification-status");
  const bypassStatus=$("account-verification-bypass-status");
  const authStatus=$("account-verification-auth-status");
  const bypassButton=$("account-verification-toggle");

  if (!section) return;

  let accounts = [];
  let registrations=new Map(),memberships=new Map(),membershipOverrides=new Map(),membershipKnown=false;
  function membershipLabel(uid){if(!membershipKnown)return "Membership unknown";const a=accounts.find(x=>x.uid===uid),m=effectiveMembership(memberships.get(uid)?.expiresAt?.toMillis?.()??null,membershipOverrides.get(uid)?.mode,activeMembershipStaff(a));return (m.status==="paid"?"Paid":"Free")+(m.override!=="actual"?" (admin test)":"");}
  async function loadMembershipLabels(){try{const [records,overrides]=await Promise.all([getDocsFromServer(collection(db,"memberships")),getDocsFromServer(collection(db,"staffMembershipOverrides"))]);memberships=new Map(records.docs.map(d=>[d.id,d.data()]));membershipOverrides=new Map(overrides.docs.map(d=>[d.id,d.data()]));membershipKnown=true;}catch(error){memberships.clear();membershipOverrides.clear();membershipKnown=false;}}
  function ageLabel(uid){
    const date=registrations.get(uid)?.birthDate?.toDate?.();
    return ageStatus(date?date.toISOString().slice(0,10):null);
  }
  let selectedUid = null;
  let managerRole = null;
  let selectedBypass=false;
  let bypassLoading=false;
  let selectedAuth=null;
  const revokeLegacy=$("account-verification-revoke-legacy");
  async function verificationRequest(action,uid,expectedEmail){
    if(usingLocalFirebaseEmulators)throw Error("Select Live Firebase in Settings before verifying real accounts.");
    const user=auth.currentUser;if(!user)throw Error("Sign in as owner.");
    const idToken=await user.getIdToken(true);if(auth.currentUser?.uid!==user.uid)throw Error("Account changed.");
    let r;try{r=await fetch("https://princesstg-cd-store-live.transgirl1991.workers.dev/owner/email-verification",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,targetUid:uid,expectedEmail,idToken})});}catch{throw Error("Cannot reach verification Worker from "+location.origin+". Check the live Worker deployment and connection, then retry.");}
    const data=await r.json();if(!r.ok)throw Error(data.error||"Verification unavailable.");return data;
  }

  function activateAccountSubtab(which){
    const choices=["roles","verification"];
    if(!choices.includes(which))return;
    for(const name of choices){
      const button=$("account-subtab-"+name);
      const panel=$("account-subpanel-"+name);
      if(!button||!panel)continue;
      const active=name===which;
      button.setAttribute("aria-selected",String(active));
      button.tabIndex=active?0:-1;
      panel.hidden=!active;
    }
  }
  for(const tab of document.querySelectorAll("[data-account-subtab]")){
    tab.addEventListener("click",()=>activateAccountSubtab(tab.dataset.accountSubtab));
  }
  verificationTab?.parentElement?.addEventListener("keydown",event=>{
    if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
    if(!event.target?.dataset?.accountSubtab)return;
    event.preventDefault();
    const next=event.key==="Home"?"roles"
      :event.key==="End"?"verification"
      :event.target.dataset.accountSubtab==="roles"?"verification":"roles";
    activateAccountSubtab(next);
    $("account-subtab-"+next).focus();
  });


  function protectedVerification(uid,target){
    return managerRole!=="owner"||!target||uid===auth.currentUser?.uid||target.role==="owner"||(target.status||"active")!=="active";
  }
  async function loadBypass(uid){
    bypassLoading=true;selectedAuth=null;selectedBypass=false;bypassButton.disabled=true;revokeLegacy.hidden=true;
    bypassStatus.textContent="Checking…";authStatus.textContent="Checking Firebase Auth…";verificationStatus.textContent="";bypassButton.textContent="Loading verification…";
    const target=accounts.find(item=>item.uid===uid);
    if(protectedVerification(uid,target)){authStatus.textContent="Protected account";bypassStatus.textContent="Unavailable";bypassButton.textContent="Unavailable";bypassLoading=false;return;}
    try{
      const snap=await getDocFromServer(doc(db,"verificationOverrides",uid));
      if(selectedUid!==uid)return;
      selectedBypass=snap.exists()&&snap.data().enabled===true;
      bypassStatus.textContent=selectedBypass?"Legacy site exception enabled":"No legacy exception";
      bypassStatus.dataset.enabled=String(selectedBypass);revokeLegacy.hidden=!selectedBypass;
      const actual=await verificationRequest("status",uid);
      if(selectedUid!==uid)return;
      selectedAuth=actual;authStatus.textContent=actual.emailVerified?"Verified in Firebase Auth":"Unverified in Firebase Auth";
      bypassButton.textContent=actual.emailVerified?"Email verified":"Grant bypass (mark email verified)";
    }catch(error){if(selectedUid===uid){authStatus.textContent="Firebase verification unavailable";bypassButton.textContent="Retry verification status";verificationStatus.textContent=error.message||publicError(error,"PTG-901");}}
    finally{if(selectedUid===uid){bypassLoading=false;revokeLegacy.disabled=false;bypassButton.disabled=selectedAuth?.emailVerified===true||protectedVerification(uid,target);}}
  }
  bypassButton.addEventListener("click",async()=>{
    const uid=selectedUid,actual=selectedAuth;
    if(!uid||bypassLoading||actual?.emailVerified)return;
    if(!actual){await loadBypass(uid);return;}
    bypassLoading=true;bypassButton.disabled=true;revokeLegacy.disabled=true;
    try{
      if(await verifyManager()!=="owner")throw Error("Only the active site owner can approve verification.");
      if(!window.confirm("Mark "+actual.email+" fully verified in Firebase Authentication?\n\nThis grants verified-only access but is not proof of email ownership. Only approve independently checked accounts."))return;
      const result=await verificationRequest("grant",uid,actual.email);
      if(selectedUid!==uid)return;
      await loadBypass(uid);
      if(selectedUid===uid&&result.emailVerified){verificationStatus.textContent="Firebase Auth verified. Ask the member to sign out and back in.";verificationStatus.style.color="#86efac";}
    }catch(error){if(selectedUid===uid){verificationStatus.textContent=error.message||publicError(error,"PTG-901");verificationStatus.style.color="#fca5a5";}}
    finally{if(selectedUid===uid){bypassLoading=false;revokeLegacy.disabled=false;bypassButton.disabled=selectedAuth?.emailVerified===true||protectedVerification(uid,accounts.find(a=>a.uid===uid));}}
  });
  revokeLegacy.addEventListener("click",async()=>{
    const uid=selectedUid;if(!uid||!selectedBypass||bypassLoading)return;
    bypassLoading=true;revokeLegacy.disabled=true;bypassButton.disabled=true;
    try{
      if(await verifyManager()!=="owner")throw Error("Owner required.");
      const target=await getDocFromServer(doc(db,"users",uid));
      if(!target.exists()||protectedVerification(uid,target.data()))throw Error("Protected account.");
      if(!window.confirm("Remove this legacy site exception? This will not undo Firebase Auth verification."))return;
      const audit=doc(collection(db,"verificationOverrideAudit")),override=doc(db,"verificationOverrides",uid),targetEmail=String(target.data().auth?.email||""),batch=writeBatch(db);
      batch.set(override,{enabled:false,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid,targetEmail,auditId:audit.id});
      batch.set(audit,{targetUid:uid,enabled:false,actorUid:auth.currentUser.uid,targetEmail,createdAt:serverTimestamp()});
      await batch.commit();if(selectedUid===uid)await loadBypass(uid);
    }catch(error){if(selectedUid===uid)verificationStatus.textContent=error.message||publicError(error,"PTG-901");}
    finally{if(selectedUid===uid){bypassLoading=false;revokeLegacy.disabled=false;bypassButton.disabled=selectedAuth?.emailVerified===true||protectedVerification(uid,accounts.find(a=>a.uid===uid));}}
  });
  activateAccountSubtab("roles");

  const durations = {
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000
  };

  function getName(data) {
    return data.auth?.displayName ||
      data.auth?.email ||
      "Unnamed User";
  }

  function getEmail(data) {
    return data.auth?.email || "No email";
  }

  function isBanActive(data) {
    if (data.status !== "banned") return false;

    if (!data.banUntil) return true;

    return data.banUntil.toMillis() > Date.now();
  }

  function describeStatus(data) {
    if (data.status === "archived") {
      return "Archived account";
    }

    if (data.status === "banned") {
      if (!isBanActive(data)) {
        return "Ban expired";
      }

      if (!data.banUntil) {
        return "Banned indefinitely";
      }

      return "Banned until " +
        data.banUntil.toDate().toLocaleString();
    }

    return `Active ${data.role || "user"}`;
  }

  function showStatus(message, error = false) {
    saveStatus.textContent=error?withErrorCode(message,"PTG-901"):message;
    saveStatus.style.color =
      error ? "#fca5a5" : "#86efac";
  }

  // ========================================
  // VERIFY OWNER AUTHORIZATION
  // ========================================


async function verifyManager() {
  await auth.authStateReady();

  const user = auth.currentUser;
  if (!user) return null;

  const snapshot = await getDocFromServer(
    doc(db, "users", user.uid)
  );

  if (!snapshot.exists()) return null;

  const data = snapshot.data();

  if ((data.status || "active") !== "active") {
    return null;
  }

  if (
    data.role === "owner" ||
    data.role === "admin"
  ) {
    return data.role;
  }

  return null;
}


  // ========================================
  // LOAD ALL ACCOUNTS
  // ========================================

  async function loadAccounts() {
    searchStatus.textContent = "Loading accounts...";

    const snapshot = await getDocsFromServer(
      collection(db, "users")
    );

    try{
      const ageRecords=await getDocsFromServer(collection(db,"accountRegistration"));
      registrations=new Map(ageRecords.docs.map(d=>[d.id,d.data()]));
    }catch(error){registrations.clear();console.warn("Age flags unavailable",error?.code);}
    await loadMembershipLabels();
    accounts = snapshot.docs.map(userDoc => ({
      uid: userDoc.id,
      ...userDoc.data()
    }));

    accounts.sort((a, b) =>
      getName(a).localeCompare(getName(b))
    );

    renderSearch();

    if (selectedUid) {
      selectAccount(selectedUid);
    }
  }

  // ========================================
  // SEARCH BY NAME OR EMAIL
  // ========================================

  function renderSearch() {
    const query = search.value
      .trim()
      .toLocaleLowerCase();

    results.replaceChildren();

    if (!query) {
      searchStatus.textContent =
        `${accounts.length} accounts loaded. ` +
        "Type a name or email to search.";
      return;
    }

    const matches = accounts.filter(data =>
      getName(data).toLocaleLowerCase()
        .includes(query) ||
      getEmail(data).toLocaleLowerCase()
        .includes(query)
    );

    const fragment = document.createDocumentFragment();

    for (const data of matches.slice(0, 40)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "account-result";

      const title = document.createElement("strong");
      title.textContent = getName(data);

      const details = document.createElement("small");
      details.textContent =
        `${getEmail(data)} | ${describeStatus(data)} | ${ageLabel(data.uid)} | ${membershipLabel(data.uid)}`;
      if(ageLabel(data.uid)==="Under 18")details.style.fontWeight="bold";

      button.append(title, details);

      button.addEventListener("click", () => {
        selectAccount(data.uid);
      });

      fragment.appendChild(button);
    }

    results.appendChild(fragment);

    searchStatus.textContent =
      `${matches.length} matching accounts` +
      (matches.length > 40
        ? " (showing first 40)"
        : "");
  }

  // ========================================
  // SELECT ACCOUNT
  // ========================================

  function selectAccount(uid) {
    const data = accounts.find(
      account => account.uid === uid
    );

    if (!data) {
      editor.hidden = true;
      selectedUid = null;
      return;
    }

    selectedUid = uid;
    editor.hidden = false;

    selectedName.textContent = getName(data);
    selectedEmail.textContent = getEmail(data);
    currentStatus.textContent = describeStatus(data)+" | "+ageLabel(uid)+" | "+membershipLabel(uid);

    if (isBanActive(data)) {
      roleSelect.value = "banned";
    } else if (data.role === "admin") {
      roleSelect.value = "admin";
    } else {
      roleSelect.value = "user";
    }

    banDuration.value = "7d";
    customEnd.value = "";

    syncBanSettings();
    const ownerControls=managerRole==="owner";
    verificationTab.hidden=!ownerControls;
    if(ownerControls)void loadBypass(uid);
    else activateAccountSubtab("roles");

const protectedAccount =
  data.role === "owner" ||
  uid === auth.currentUser?.uid ||
  data.status === "archived" ||
  (
    managerRole !== "owner" &&
    data.role === "admin"
  );

// Only the owner may assign admin privileges.
const adminOption = roleSelect.querySelector(
  'option[value="admin"]'
);

if (adminOption) {
  adminOption.disabled =
    managerRole !== "owner";

  adminOption.hidden =
    managerRole !== "owner";
}


    roleSelect.disabled = protectedAccount;
    saveButton.disabled = protectedAccount;

    showStatus(
      protectedAccount
        ? "This account cannot be modified here."
        : ""
    );
  }

  // ========================================
  // SHOW BAN DURATION FIELDS
  // ========================================

  function syncBanSettings() {
    const banning = roleSelect.value === "banned";

    banSettings.hidden = !banning;

    customBan.hidden = !banning ||
      banDuration.value !== "custom";

    customEnd.required = banning &&
      banDuration.value === "custom";
  }

  roleSelect.addEventListener(
    "change",
    syncBanSettings
  );

  banDuration.addEventListener(
    "change",
    syncBanSettings
  );

  // ========================================
  // CALCULATE BAN EXPIRATION
  // ========================================

  function getBanUntil() {
    const duration = banDuration.value;

    if (duration === "indefinite") {
      return null;
    }

    let end;

    if (duration === "custom") {
      end = new Date(customEnd.value);

      if (Number.isNaN(end.getTime())) {
        throw new Error(
          "Choose a valid ban end date."
        );
      }

    } else {
      end = new Date(
        Date.now() + durations[duration]
      );
    }

    if (end.getTime() <= Date.now()) {
      throw new Error(
        "The ban must end in the future."
      );
    }

    return Timestamp.fromDate(end);
  }

  // ========================================
  // SAVE ACCOUNT CHANGES
  // ========================================

  saveButton.addEventListener("click", async () => {
    if (!selectedUid) return;

    saveButton.disabled = true;

    try {

const currentRole = await verifyManager();

if (!currentRole) {
  throw new Error(
    "Administrator permissions required."
  );
}

managerRole = currentRole;


      if (selectedUid === auth.currentUser.uid) {
        throw new Error(
          "You cannot change your own role."
        );
      }

      const targetRef = doc(
        db,
        "users",
        selectedUid
      );

      const targetSnapshot =
        await getDocFromServer(targetRef);

      if (!targetSnapshot.exists()) {
        throw new Error("Account not found.");
      }

      const target = targetSnapshot.data();

      if (
        target.role === "owner" ||
        target.status === "archived"
      ) {
        throw new Error(
          "This account is protected."
        );
      }


if (
  managerRole !== "owner" &&
  target.role !== "user"
) {
  throw new Error(
    "Administrators can only moderate regular users."
  );
}

if (
  managerRole !== "owner" &&
  roleSelect.value === "admin"
) {
  throw new Error(
    "Only the owner can assign administrator roles."
  );
}


      const choice = roleSelect.value;
      const banning = choice === "banned";

      const role = banning ? "user" : choice;
      const status = banning ? "banned" : "active";

      if (!["user", "admin"].includes(role)) {
        throw new Error("Invalid role selection.");
      }

      const banUntil = banning
        ? getBanUntil()
        : null;


const banId = banning
  ? (
      isBanActive(target) &&
      typeof target.banId === "string" &&
      target.banId
        ? target.banId
        : crypto.randomUUID()
    )
  : null;


      const action = banning
        ? banUntil
          ? `Ban until ${banUntil.toDate().toLocaleString()}`
          : "Ban indefinitely"
        : `Set role to ${role} and remove any ban`;

      if (!window.confirm(
        `${action}\n\n` +
        `${getName(target)}\n` +
        `${getEmail(target)}\n\n` +
        "Confirm this account change?"
      )) {
        return;
      }

      // ====================================
      // UPDATE FIRESTORE ACCOUNT RECORD
      // ====================================


await updateDoc(targetRef, {
  role,
  status,
  banUntil,
  banId,
  updatedAt: serverTimestamp()
});


      showStatus(
        `Account updated successfully: ${action}`
      );

      // Reload to reflect the server's data.
      await loadAccounts();

    } catch (error) {
      console.error(
        "Account management error:",
        error
      );

      showStatus(publicError(error,"PTG-901"), true);

    } finally {
      if (selectedUid) {
        const current = accounts.find(
          data => data.uid === selectedUid
        );

        saveButton.disabled =
          !current ||
          (managerRole !== "owner" && current.role === "admin") ||
          current.status === "archived" ||
          selectedUid === auth.currentUser?.uid;
      }
    }
  });

  search.addEventListener("input", renderSearch);
  // Refresh derived badges when an open admin page crosses a UTC date boundary.
  let lastAgeDate=new Date().toISOString().slice(0,10);
  function refreshAgeFlags(){
    const today=new Date().toISOString().slice(0,10);
    if(today===lastAgeDate)return;lastAgeDate=today;renderSearch();
    const selected=accounts.find(a=>a.uid===selectedUid);
    if(selected)currentStatus.textContent=describeStatus(selected)+" | "+ageLabel(selectedUid)+" | "+membershipLabel(selectedUid);
  }
  document.addEventListener("ptg:membership-override-changed",async()=>{await loadMembershipLabels();renderSearch();const selected=accounts.find(a=>a.uid===selectedUid);if(selected)currentStatus.textContent=describeStatus(selected)+" | "+ageLabel(selectedUid)+" | "+membershipLabel(selectedUid);});
  setInterval(refreshAgeFlags,60000);
  window.addEventListener("focus",refreshAgeFlags);

  refreshButton.addEventListener(
    "click",
    async () => {
      try {
        await loadAccounts();
      } catch (error) {
        searchStatus.textContent =
          publicError(error,"PTG-901");
      }
    }
  );

  // ========================================
  // START OWNER-ONLY MANAGER
  // ========================================

  try {
managerRole = await verifyManager();

if (!managerRole) return;

section.hidden = false;
await loadAccounts();

  } catch (error) {
    console.error(
      "Unable to initialize account manager:",
      error
    );
  }
});
