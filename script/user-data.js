
import { auth, db } from "./firebase.js";
import {hasSiteVerificationAccess} from "./verification-access.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

// ==========================================
// DATABASE SETTINGS
// ==========================================

const COLLECTION_NAME = "users";
const SAVE_INTERVAL = 60 * 1000;

// ==========================================
// USER SESSION STATE
// ==========================================

let currentUid = null;
let currentRef = null;
let currentRecord = null;
let lastSavedAuth = null;

let sessionVersion = 0;
let readyPromise = null;
let writingPromise = null;
let initializationError = null;

// Profile pages wait for their own Firebase user record rather than racing
// new-account initialization with a second, independent Firestore lookup.
export async function waitForUserRecord(uid, maxWaitMs=6000) {
  if (!uid || currentUid!==uid || !readyPromise) return null;
  let timeout;
  try {
    await Promise.race([
      readyPromise,
      new Promise(resolve=>{timeout=setTimeout(resolve,maxWaitMs);})
    ]);
  } finally {
    if(timeout)clearTimeout(timeout);
  }
  if (currentUid!==uid) return null;
  if (initializationError) throw initializationError;
  return currentRecord;
}

// Public mail directory contains display names only, never private emails,
// roles, passwords, or account records. It is opt-in via verification of the
// site's email address; existing members enroll the next time they log in.
let directorySync = null;
async function syncMailDirectory(user) {
  if (!hasSiteVerificationAccess(user) || currentUid !== user.uid) return;
  const memberName = String(currentRecord?.auth?.displayName || "");
  if (!memberName.trim()) return;
  // Keep the exact stored public name so Firestore rules can reject a
  // forged directory entry without needing to expose private user profiles.
  if (directorySync) return directorySync;
  directorySync = (async () => {
    const memberRef = doc(db, "siteMailDirectory", user.uid);
    const previous = await getDoc(memberRef);
    if (previous.exists() && previous.data()?.name === memberName) return;
    await setDoc(memberRef, {name:memberName, updatedAt:serverTimestamp()});
  })();
  try {await directorySync;}
  finally {directorySync = null;}
}

// ==========================================
// GET SAFE AUTH INFORMATION
// ==========================================

function getAuthInfo(user) {
  return {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    emailVerified: user.emailVerified
  };
}

// ==========================================
// GET CURRENT USER RECORD
// ==========================================

export function getUserRecord() {
  if (!currentRecord) return null;

  return {
    ...currentRecord,
    auth: { ...currentRecord.auth }
  };
}

// ==========================================
// INITIALIZE USER DOCUMENT
// ==========================================

onAuthStateChanged(auth, (user) => {
  const session = ++sessionVersion;

  currentUid = user?.uid ?? null;
  currentRef = null;
  currentRecord = null;
  lastSavedAuth = null;
  readyPromise = null;
  writingPromise = null;
  initializationError = null;

  if (!user) {
    console.log("User database: Signed out.");
    return;
  }

  const userRef = doc(
    db,
    COLLECTION_NAME,
    user.uid
  );

  readyPromise = (async () => {

    // Transaction prevents two tabs from
    // accidentally overwriting a new account.

    const record = await runTransaction(
      db,
      async transaction => {

        const snapshot = await transaction.get(userRef);

        // Existing user: retain all saved data,
        // including administrator role.

        if (snapshot.exists()) {
          return snapshot.data();
        }

        // New user: create default database record.

        const newRecord = {
          auth: getAuthInfo(user),
          role: "user",
          status: "active",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        transaction.set(userRef, newRecord);

        return newRecord;
      }
    );

    // Ignore results from an old login session.
    if (session !== sessionVersion) return;

    currentRef = userRef;
    currentRecord = record;
    lastSavedAuth = record.auth;

    console.log(
      "User database initialized:",
      user.uid
    );

    console.log(
      "Account role:",
      record.role
    );

    // Notify future scripts that user data is ready.

    window.dispatchEvent(
      new CustomEvent("princesstg-user-ready", {
        detail: {
          uid: user.uid,
          role: record.role
        }
      })
    );

    if (hasSiteVerificationAccess(user)) {
      // Update stale auth metadata before indexing the display name.
      // This never exposes users/{uid} documents to other members.
      void saveUserIfChanged()
        .then(() => syncMailDirectory(user))
        .catch(error => console.warn("Mail directory registration deferred:",error));
    }

  })().catch(error => {
    if (session===sessionVersion) initializationError=error;
    console.error("Unable to initialize user database:",error);
    // Existing account documents are retained; never create a temporary
    // local replacement that could obscure Firestore rule/connection failures.
  });
});

// ==========================================
// SAVE ONLY WHEN SOMETHING CHANGED
// ==========================================

export async function saveUserIfChanged() {

  // Wait until the user record is initialized.
  if (readyPromise) {
    await readyPromise;
  }

  const user = auth.currentUser;

  if (
    !user ||
    !currentRef ||
    !currentRecord ||
    currentUid !== user.uid
  ) {
    return false;
  }

  // Avoid simultaneous writes.
  if (writingPromise) {
    await writingPromise;
  }

  // Recheck after any ongoing write.
  if (
    currentUid !== auth.currentUser?.uid ||
    !currentRef
  ) {
    return false;
  }

  const authInfo = getAuthInfo(user);

  // No changes means no database write.
  if (
    JSON.stringify(authInfo) ===
    JSON.stringify(lastSavedAuth)
  ) {
    return false;
  }

  const session = sessionVersion;
  const userRef = currentRef;

  // ========================================
  // UPDATE AUTH INFO ONLY
  // NEVER OVERWRITE ROLE
  // ========================================

  const pending = updateDoc(userRef, {
    auth: authInfo,
    updatedAt: serverTimestamp()
  });

  writingPromise = pending;

  try {
    await pending;

    if (session === sessionVersion) {
      lastSavedAuth = authInfo;

      currentRecord = {
        ...currentRecord,
        auth: authInfo
      };
      void syncMailDirectory(user).catch(error=>{
        console.warn("Mail directory update deferred:",error);
      });
    }

    console.log("User changes saved.");

    return true;

  } finally {
    if (writingPromise === pending) {
      writingPromise = null;
    }
  }
}

// ==========================================
// AUTOMATIC SAVE EVERY MINUTE
// ==========================================

setInterval(() => {
  saveUserIfChanged().catch(error => {
    console.error(
      "Automatic user save failed:",
      error
    );
  });
}, SAVE_INTERVAL);

// ==========================================
// SAVE WHEN PAGE IS HIDDEN
// ==========================================

document.addEventListener(
  "visibilitychange",
  () => {
    if (document.visibilityState === "hidden") {
      saveUserIfChanged().catch(error => {
        console.warn(
          "Could not save before leaving page:",
          error
        );
      });
    }
  }
);

window.addEventListener("princesstg:email-verified", () => {
  const user = auth.currentUser;
  if (!user?.emailVerified) return;
  void saveUserIfChanged()
    .then(() => syncMailDirectory(user))
    .catch(error=>console.warn("Mail directory registration deferred:",error));
});

window.addEventListener("princesstg:verification-access-changed",event=>{
  const user=auth.currentUser;
  if(!user || event.detail?.uid!==user.uid || !hasSiteVerificationAccess(user))return;
  void saveUserIfChanged()
    .then(()=>syncMailDirectory(user))
    .catch(error=>console.warn("Bypassed member directory sync deferred:",error));
});
