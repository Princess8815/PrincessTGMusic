
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

import {
  doc,
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

  })().catch(error => {
    console.error(
      "Unable to initialize user database:",
      error
    );
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
