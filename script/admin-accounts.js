
import { auth, db } from "./firebase.js";

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
  let selectedUid = null;
  let managerRole = null;
  let selectedBypass=false;
  let bypassLoading=false;

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

  async function loadBypass(uid){
    bypassLoading=true;
    bypassButton.disabled=true;
    bypassStatus.textContent="Checking…";
    verificationStatus.textContent="";
    const target=accounts.find(item=>item.uid===uid);
    authStatus.textContent=target?.auth?.emailVerified===true
      ? "Verified in last saved profile" : "Not verified in last saved profile";
    try{
      const snap=await getDocFromServer(doc(db,"verificationOverrides",uid));
      if(selectedUid!==uid)return;
      selectedBypass=snap.exists()&&snap.data().enabled===true;
      bypassStatus.textContent=selectedBypass?"Bypass ENABLED":"Bypass disabled";
      bypassStatus.dataset.enabled=String(selectedBypass);
      bypassButton.dataset.action=selectedBypass?"revoke":"grant";
      bypassButton.textContent=selectedBypass
        ? "Revoke verification bypass" : "Grant verification bypass";
    }catch(error){
      if(selectedUid!==uid)return;
      verificationStatus.textContent="Cannot load exception: "+error.message;
      bypassStatus.textContent="Unavailable";
      selectedBypass=false;
      bypassButton.disabled=true;
      return;
    }finally{
      if(selectedUid===uid){
        bypassLoading=false;
        bypassButton.disabled=managerRole!=="owner"
          ||uid===auth.currentUser?.uid
          ||target?.role==="owner"
          ||target?.status==="archived";
      }
    }
    if(managerRole!=="owner")verificationStatus.textContent=
      "Only the site owner can grant or revoke verification exceptions.";
  }

  bypassButton.addEventListener("click",async()=>{
    const uid=selectedUid;
    if(!uid||bypassLoading)return;
    bypassLoading=true;bypassButton.disabled=true;
    try{
      const role=await verifyManager();
      if(role!=="owner")throw Error("Only the active site owner may change verification bypasses.");
      if(uid===auth.currentUser?.uid)throw Error("You cannot bypass verification on your own account.");
      const targetRef=doc(db,"users",uid);
      const snap=await getDocFromServer(targetRef);
      if(!snap.exists())throw Error("Target account no longer exists.");
      const target=snap.data();
      if(target.role==="owner"||target.status==="archived")
        throw Error("Owner and archived accounts are protected.");
      const next=!selectedBypass;
      const label=target.auth?.displayName||target.auth?.email||uid;
      if(!window.confirm(
        (next?"GRANT":"REVOKE")+" email verification BYPASS for "+label+"?\n\n"+
        (next
          ?"This account will use member features without proving ownership of its email address. Firebase Auth will remain unverified."
          :"This account will need genuine Firebase email verification to regain verified-only features.")+
        "\n\nConfirm this owner-only exception change?"
      ))return;
      const audit=doc(collection(db,"verificationOverrideAudit"));
      const override=doc(db,"verificationOverrides",uid);
      const targetEmail=String(target.auth?.email||"");
      const batch=writeBatch(db);
      batch.set(override,{
        enabled:next,
        updatedAt:serverTimestamp(),
        updatedBy:auth.currentUser.uid,
        targetEmail,
        auditId:audit.id
      });
      batch.set(audit,{
        targetUid:uid,
        enabled:next,
        actorUid:auth.currentUser.uid,
        targetEmail,
        createdAt:serverTimestamp()
      });
      await batch.commit();
      await loadBypass(uid);
      if(selectedUid===uid){
        verificationStatus.textContent=
          next?"Bypass granted. This account may now use verified-only site features."
              :"Bypass revoked. Genuine email verification is required again.";
        verificationStatus.style.color="#86efac";
      }
    }catch(error){
      console.error("Owner verification bypass action failed:",error);
      verificationStatus.textContent="Bypass change failed: "+error.message;
      verificationStatus.style.color="#fca5a5";
    }finally{
      bypassLoading=false;
      const target=accounts.find(item=>item.uid===uid);
      bypassButton.disabled=selectedUid!==uid||managerRole!=="owner"
        ||uid===auth.currentUser?.uid||target?.role==="owner"
        ||target?.status==="archived";
    }
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
    saveStatus.textContent = message;
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
        `${getEmail(data)} | ${describeStatus(data)}`;

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
    currentStatus.textContent = describeStatus(data);

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
    void loadBypass(uid);

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

      showStatus(error.message, true);

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

  refreshButton.addEventListener(
    "click",
    async () => {
      try {
        await loadAccounts();
      } catch (error) {
        searchStatus.textContent =
          `Could not refresh: ${error.message}`;
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
