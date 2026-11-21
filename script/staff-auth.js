
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

import {
  doc,
  getDocFromServer,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

// ==========================================
// PERMITTED STAFF ROLES
// ==========================================

const STAFF_ROLES = ["admin", "owner"];

export function isStaffRole(role) {
  return STAFF_ROLES.includes(role);
}

// ==========================================
// UNIVERSAL STAFF VERIFICATION
// ==========================================
// Always verify using the current Firestore
// document rather than trusting a saved
// role in the browser.
// ==========================================

export async function verifyStaff() {
  // Wait for Firebase Authentication to
  // finish restoring the login session.
  await auth.authStateReady();

  const user = auth.currentUser;

  if (!user) {
    return false;
  }

  try {
    const snapshot = await getDocFromServer(
      doc(db, "users", user.uid)
    );

    if (!snapshot.exists()) {
      return false;
    }

    return isStaffRole(snapshot.data().role);

  } catch (error) {
    console.error(
      "Staff verification failed:",
      error
    );

    // If verification fails, deny access.
    return false;
  }
}

// ==========================================
// WATCH STAFF PERMISSIONS
// ==========================================
// true  = admin or owner
// false = not authorized
// null  = still checking
// ==========================================

export function watchStaffRole(callback) {
  let stopDocumentListener = () => {};

  const stopAuthListener = onAuthStateChanged(
    auth,

    (user) => {
      stopDocumentListener();
      stopDocumentListener = () => {};

      callback(null);

      if (!user) {
        callback(false);
        return;
      }

      stopDocumentListener = onSnapshot(
        doc(db, "users", user.uid),
        { includeMetadataChanges: true },

        (snapshot) => {
          if (auth.currentUser?.uid !== user.uid) {
            return;
          }

          // Never grant permissions from
          // potentially outdated cached data.
          if (snapshot.metadata.fromCache) {
            callback(null);
            return;
          }

          const allowed =
            snapshot.exists() &&
            isStaffRole(snapshot.data().role);

          callback(allowed);
        },

        (error) => {
          console.error(
            "Staff role listener failed:",
            error
          );

          callback(false);
        }
      );
    },

    (error) => {
      console.error(
        "Auth state listener failed:",
        error
      );

      callback(false);
    }
  );

  // Allows future pages to stop monitoring.
  return () => {
    stopAuthListener();
    stopDocumentListener();
  };
}

// ==========================================
// UNIVERSAL ADMIN PAGE GUARD
// ==========================================

export async function guardStaffPage({
  contentId = "admin-content",
  statusId = "admin-status",
  redirectURL = "../index.html"
} = {}) {

  const content = document.getElementById(
    contentId
  );

  const status = document.getElementById(
    statusId
  );

  // Protected content starts hidden.
  if (content) {
    content.hidden = true;
  }

  if (status) {
    status.textContent =
      "Verifying administrator access...";
  }

  // ========================================
  // VERIFY WHEN OPENING THE PAGE
  // ========================================

  const allowed = await verifyStaff();

  if (!allowed) {
    if (status) {
      status.textContent =
        "Access denied. Redirecting...";
    }

    window.location.replace(redirectURL);
    return false;
  }

  // ========================================
  // ACCESS GRANTED
  // ========================================

  if (content) {
    content.hidden = false;
  }

  if (status) {
    status.hidden = true;
  }

  // ========================================
  // KEEP MONITORING ROLE CHANGES
  // ========================================

  watchStaffRole((stillAllowed) => {

    // null means verification is in progress.
    if (stillAllowed === null) {
      return;
    }

    if (!stillAllowed) {
      if (content) {
        content.hidden = true;
      }

      window.location.replace(redirectURL);
    }
  });

  return true;
}
