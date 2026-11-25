import {publicError,withErrorCode} from "./site-errors.js";

import { auth, db, usingLocalFirebaseEmulators, checkLocalFirestoreEmulator } from "./firebase.js";
import {hasOwnerVerificationBypass} from "./verification-access.js";
import { waitForUserRecord } from "./user-data.js";
import "./ban-expiry.js";
import {revokeShare} from "./docs-share.js";
import {deleteAccountPlaylists} from "./music-playlists.js";
import {deleteReefCollection} from "./reef-collection.js";

import {
  onAuthStateChanged,
  updateProfile,
  verifyBeforeUpdateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

import {
  collection,
  doc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  writeBatch,
  query,
  where,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

// ==========================================
// PROFILE ELEMENTS
// ==========================================

const $ = id => document.getElementById(id);

const SONG_PAGE = new URL(
  "../audioPlayer/pages/song.html",
  import.meta.url
);

let account = null;
let accountData = null;

function setStatus(id, message, error = false) {
  const element = $(id);
  if (!element) return;

  element.textContent=error?withErrorCode(message,"PTG-110"):message;
  element.style.color = error
    ? "#fca5a5"
    : "#86efac";
  // The Overview tab shows status from Firestore. Only reveal the banner
  // for an error or account restriction, not a lingering loading message.
  if (id === "profile-status") element.hidden = !error;
}


function isBanActive() {
  if (accountData?.status !== "banned") {
    return false;
  }

  const expiry = accountData.banUntil?.toMillis?.();

  if (!Number.isFinite(expiry)) {
    return true;
  }

  return expiry > Date.now();
}

function isActive() {
  // Legacy account documents may not have a status field.
  // Match the rest of the site: only explicit bans/archives restrict access.
  const status = accountData?.status || "active";

  return status === "active" ||
    (
      status === "banned" &&
      !isBanActive()
    );
}


function accountRef(user) {
  return doc(db, "users", user.uid);
}

function authFields(user) {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || null,
    photoURL: user.photoURL || null,
    emailVerified: user.emailVerified === true
  };
}

function dateText(value) {
  if (!value?.toDate) return "Not available";

  return value.toDate().toLocaleDateString();
}

// ==========================================
// RENDER ACCOUNT DETAILS
// ==========================================

function renderAccount() {
  $("profile-role").textContent =
    accountData.role || "user";

$("profile-account-status").textContent =
  isBanActive()
    ? "banned"
    : accountData.status === "banned"
      ? "active (ban expired)"
      : accountData.status || "active";

  $("profile-joined").textContent =
    dateText(accountData.createdAt);

  $("profile-name").value =
    account.displayName || "";

  $("profile-bio").value =
    accountData.bio || "";

  $("profile-current-email").textContent =
    account.email || "Unavailable";

  $("profile-email-verified").textContent =
    account.emailVerified
      ? "Email verified"
      : hasOwnerVerificationBypass(account)
        ? "Email not verified · owner-approved site bypass"
        : "Email not verified";

  updateBioCount();
  renderNewsletter();

  const active = isActive();

  for (const id of [
    "profile-name",
    "profile-bio",
    "save-profile",
    "profile-new-email",
    "profile-email-password",
    "profile-change-email"
  ]) {
    $(id).disabled = !active;
  }

  if (isBanActive()) {
    $("close-details").hidden = true;

    setStatus(
      "profile-status",
      "This account is banned. Contact the site administrator.",
      true
    );

  } else if (
    accountData.role === "owner" &&
    active
  ) {
    $("close-details").hidden = true;

    setStatus(
      "close-account-status",
      "Transfer site ownership before closing the owner account.",
      true
    );

  } else if (!active) {
    $("close-details").hidden = false;

    setStatus(
      "profile-status",
      "This account is archived. Only completion of login deletion is available.",
      true
    );

  } else {
    $("close-details").hidden = false;

    setStatus(
      "profile-status",
      "Your profile is ready."
    );
  }
}

function updateBioCount() {
  $("profile-bio-count").textContent =
    `${$("profile-bio").value.length} / 500`;
}

$("profile-bio").addEventListener(
  "input",
  updateBioCount
);

// ==========================================
// LOAD PROFILE
// ==========================================

async function loadAccountSnapshot(user) {
  let timer;
  try {
    return await Promise.race([
      getDocFromServer(accountRef(user)),
      new Promise((_, reject) => {
        timer = setTimeout(() =>
          reject(new Error("Account lookup timed out.")),
          usingLocalFirebaseEmulators ? 8500 : 15000);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function loadProfile(user) {
  if(usingLocalFirebaseEmulators) {
    // Signing in only proves the Auth emulator on 9099 is alive, not that
    // Firestore on 8080 has started. Detect that before a long SDK timeout.
    const firestore=await checkLocalFirestoreEmulator();
    if(!firestore.connected){
      throw new Error("Account temporarily unavailable.");
    }
  }

  // Firebase Auth sign-in can finish before the users/{uid} record is
  // created. Wait for the existing account initialization transaction.
  await waitForUserRecord(user.uid, 6000);
  let snapshot = await loadAccountSnapshot(user);
  if (!snapshot.exists()) {
    await waitForUserRecord(user.uid, 3500);
    snapshot = await loadAccountSnapshot(user);
  }
  if (!snapshot.exists()) {
    throw new Error("Your account is not ready yet.");
  }

  account = user;
  accountData = snapshot.data();

  $("profile-app").hidden = false;

  renderAccount();
  // Published songs load in their own tab, without delaying account details.
  void loadSubmissions(user);
}

// ==========================================
// SAVE NAME AND BIO
// ==========================================

$("profile-form").addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    if (!account || !isActive()) return;

    const button = $("save-profile");
    button.disabled = true;

    try {
      const name = $("profile-name").value.trim();
      const bio = $("profile-bio").value.trim();

      if (!name || name.length > 80) {
        throw new Error(
          "Display name must be 1 to 80 characters."
        );
      }

      if (bio.length > 500) {
        throw new Error(
          "Bio must be 500 characters or fewer."
        );
      }

      // Update Firebase Authentication.
      if (name !== (account.displayName || "")) {
        await updateProfile(account, {
          displayName: name
        });
      }

      // Update only this user's Firestore document.
      await updateDoc(accountRef(account), {
        auth: authFields(account),
        bio,
        updatedAt: serverTimestamp()
      });

      accountData.bio = bio;

      setStatus(
        "profile-save-status",
        "Profile saved successfully!"
      );

    } catch (error) {
      setStatus(
        "profile-save-status",
        publicError(error,"PTG-110"),
        true
      );

    } finally {
      button.disabled = !isActive();
    }
  }
);

// ==========================================
// CHANGE EMAIL WITH VERIFICATION
// ==========================================

$("profile-email-form").addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    if (!account || !isActive()) return;

    const button = $("profile-change-email");
    button.disabled = true;

    try {
      const newEmail =
        $("profile-new-email").value.trim();

      const password =
        $("profile-email-password").value;

      if (!newEmail || !password) {
        throw new Error(
          "Enter your new email and current password."
        );
      }

      const credential =
        EmailAuthProvider.credential(
          account.email,
          password
        );

      await reauthenticateWithCredential(
        account,
        credential
      );

      await verifyBeforeUpdateEmail(
        account,
        newEmail
      );

      $("profile-email-password").value = "";

      setStatus(
        "profile-email-status",
        "Verification sent. Open the email sent to your new address to approve the change."
      );

    } catch (error) {
      setStatus(
        "profile-email-status",
        publicError(error,"PTG-110"),
        true
      );

    } finally {
      button.disabled = !isActive();
    }
  }
);

// ==========================================
// SHOW PUBLISHED SONGS BY THIS USER
// ==========================================

async function loadSubmissions(user) {
  const list = $("profile-submissions");

  list.replaceChildren();

  setStatus(
    "profile-submissions-status",
    "Loading associated songs..."
  );

  try {
    const songsQuery = query(
      collection(db, "songs"),
      where("submittedBy.uid", "==", user.uid)
    );

    const snapshot = await getDocs(songsQuery);

    if (snapshot.empty) {
      setStatus(
        "profile-submissions-status",
        "No published songs associated with this account yet."
      );
      return;
    }

    for (const songDoc of snapshot.docs) {
      const song = songDoc.data();

      const item = document.createElement("li");
      const link = document.createElement("a");

      const url = new URL(SONG_PAGE.href);

      url.searchParams.set(
        "id",
        songDoc.id
      );

      link.href = url.href;
      link.textContent =
        song.title || songDoc.id;

      item.appendChild(link);
      list.appendChild(item);
    }

    setStatus(
      "profile-submissions-status",
      `${snapshot.size} published song(s) found.`
    );

  } catch (error) {
    setStatus(
      "profile-submissions-status",
      publicError(error,"PTG-110"),
      true
    );
  }
}

// ==========================================
// NEWSLETTER SUBSCRIPTION
// ==========================================

function renderNewsletter() {
  const subscribed =
    accountData.newsletterSubscribed === true;

  $("newsletter-state").textContent =
    subscribed
      ? "You are subscribed."
      : "You are not subscribed.";

  $("newsletter-button").textContent =
    subscribed
      ? "Unsubscribe from Email List"
      : "Subscribe to Email List";

  $("newsletter-button").disabled = !isActive();
}

$("newsletter-button").addEventListener(
  "click",
  async () => {
    if (!account || !isActive()) return;

    const button = $("newsletter-button");
    button.disabled = true;

    const nextValue =
      accountData.newsletterSubscribed !== true;

    try {
      await updateDoc(accountRef(account), {
        newsletterSubscribed: nextValue,
        newsletterUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      accountData.newsletterSubscribed =
        nextValue;

      renderNewsletter();

      setStatus(
        "newsletter-status",
        nextValue
          ? "You have subscribed to email updates!"
          : "You have unsubscribed from email updates."
      );

    } catch (error) {
      setStatus(
        "newsletter-status",
        publicError(error,"PTG-110"),
        true
      );

    } finally {
      button.disabled = !isActive();
    }
  }
);

// Delete private health records while the user can still authorize their
// own Firestore subcollection. Deleting Firebase Auth alone does NOT delete
// Firestore subcollections. This runs after archiving but before Auth removal.
async function deletePrivateHealthBeforeClosure(uid){
  const snapshot=await getDocsFromServer(collection(db,"users",uid,"healthDays"));
  const references=snapshot.docs.map(entry=>entry.ref);
  references.push(doc(db,"users",uid,"healthSettings","main"));
  for(let start=0;start<references.length;start+=400){
    const batch=writeBatch(db);
    for(const item of references.slice(start,start+400))batch.delete(item);
    await batch.commit();
  }
}

// Delete only the closing member's own documents; Firestore does not
// automatically remove nested chunks when a parent document is deleted.
async function deletePrivateDocsBeforeClosure(uid){
  const shares=await getDocsFromServer(collection(db,"users",uid,"documentShares"));
  for(const share of shares.docs)await revokeShare(uid,share.id);
  const library=await getDocsFromServer(collection(db,"users",uid,"documents"));
  for(const record of library.docs){
    const chunks=await getDocsFromServer(collection(record.ref,"chunks"));
    const refs=[...chunks.docs.map(chunk=>chunk.ref),record.ref];
    for(let start=0;start<refs.length;start+=400){
      const batch=writeBatch(db);
      for(const ref of refs.slice(start,start+400))batch.delete(ref);
      await batch.commit();
    }
  }
}

// ==========================================
// DELETE LOGIN AND ARCHIVE ACCOUNT
// ==========================================

$("close-account-form").addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    if (!account) return;

    const status = accountData.status || "active";

    if (isBanActive()) {
      setStatus(
        "close-account-status",
        "Banned accounts cannot use this closure workflow.",
        true
      );
      return;
    }

    if (
      accountData.role === "owner" &&
      status === "active"
    ) {
      setStatus(
        "close-account-status",
        "Transfer ownership before deleting this account.",
        true
      );
      return;
    }

    if ($("close-account-confirm").value !== "DELETE") {
      setStatus(
        "close-account-status",
        "Type DELETE exactly to continue.",
        true
      );
      return;
    }

    const confirmed = window.confirm(
      "FINAL WARNING:\n\n" +
      "Your login will be permanently deleted.\n" +
      "Your account record will be archived.\n" +
      "You may lose access to your submissions and account history.\n\n" +
      "Do you want to continue?"
    );

    if (!confirmed) return;

    const button = $("close-account-button");
    button.disabled = true;

    try {
      const credential =
        EmailAuthProvider.credential(
          account.email,
          $("close-account-password").value
        );

      // Confirm ownership before changing anything.
      await reauthenticateWithCredential(
        account,
        credential
      );

      if (isActive()) {
        // Keep an archival record but remove the
        // bio and newsletter opt-in.
        await updateDoc(accountRef(account), {
          status: "archived",
          archivedAt: serverTimestamp(),
          bio: "",
          newsletterSubscribed: false,
          newsletterUpdatedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        accountData.status = "archived";
        accountData.bio = "";
        accountData.newsletterSubscribed = false;
      }

      // Remove health diary, workout, weight and meal-planning data
      // before deleting the sign-in credentials. An error stops closure
      // rather than silently leaving private health records orphaned.
      await deletePrivateHealthBeforeClosure(account.uid);
      // Remove the document chunks before their parent records and Auth login.
      await deletePrivateDocsBeforeClosure(account.uid);
      await deleteAccountPlaylists(account.uid);
      await deleteReefCollection(account.uid);

      // Delete the actual Firebase Auth login.
      await deleteUser(account);

      window.location.replace(
        new URL("../index.html", import.meta.url).href
      );

    } catch (error) {
      setStatus(
        "close-account-status",
        publicError(error,"PTG-111"),
        true
      );

    } finally {
      button.disabled = false;
    }
  }
);


window.addEventListener(
  "princesstg:ban-expired",
  async () => {
    if (!account) return;

    const snapshot = await getDocFromServer(
      accountRef(account)
    );

    if (!snapshot.exists()) return;

    accountData = snapshot.data();
    renderAccount();
  }
);


// The Firebase email link may be confirmed in a second browser tab.
// Update the visible status on this page when the current Firebase Auth
// user has reloaded and passed verification, without losing profile edits.
window.addEventListener("princesstg:verification-access-changed",event=>{
  if(account?.uid!==event.detail?.uid)return;
  const indicator=$("profile-email-verified");
  if(indicator){
    indicator.textContent=account.emailVerified?"Email verified"
      :event.detail?.bypassed
        ?"Email not verified · owner-approved site bypass"
        :"Email not verified";
  }
});
window.addEventListener("princesstg:email-verified",()=>{
  const user=auth.currentUser;
  if(!user?.emailVerified || account?.uid!==user.uid)return;
  account=user;
  if(accountData?.auth)accountData.auth.emailVerified=true;
  const indicator=$("profile-email-verified");
  if(indicator)indicator.textContent="Email verified";
  const status=$("profile-email-status");
  if(status)status.textContent="Email verified successfully.";
});

// ==========================================
// AUTHENTICATION STATE
// ==========================================

let loadingProfile = false;
async function tryLoadProfile(user) {
  if(!user || loadingProfile)return;
  loadingProfile=true;
  $("profile-retry").hidden=true;
  $("profile-retry").disabled=true;
  $("profile-status").hidden=true;
  try {
    await loadProfile(user);
    $("profile-retry").hidden=true;
  } catch(error) {
    console.error("Profile initialization failed:",error);
    setStatus("profile-status",publicError(error,"PTG-110"),true);
    $("profile-retry").hidden=false;
  } finally {
    loadingProfile=false;
    $("profile-retry").disabled=false;
  }
}
$("profile-retry").addEventListener("click",()=>{
  void tryLoadProfile(auth.currentUser);
});
onAuthStateChanged(auth,user=>{
  $("profile-app").hidden=true;
  if(!user){
    window.location.replace(
      new URL("../index.html",import.meta.url).href
    );
    return;
  }
  void tryLoadProfile(user);
});
