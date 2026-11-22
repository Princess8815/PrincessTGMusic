
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

import {
  doc,
  getDocFromServer,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

// ==========================================
// AUTOMATIC TEMPORARY BAN EXPIRATION
// ==========================================

let expiryTimer = null;

onAuthStateChanged(auth, user => {
  if (expiryTimer !== null) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }

  if (!user) return;

  const uid = user.uid;
  const userRef = doc(db, "users", uid);

  async function checkBanExpiration() {
    if (auth.currentUser?.uid !== uid) return;

    try {
      const snapshot = await getDocFromServer(userRef);

      if (!snapshot.exists()) return;

      const data = snapshot.data();

      if (data.status !== "banned") return;

      // Null means an indefinite ban.
      // Those must never expire automatically.
      if (!data.banUntil?.toMillis) return;

      const remaining =
        data.banUntil.toMillis() - Date.now();

      // Ban has not expired yet.
      if (remaining > 0) {
        expiryTimer = setTimeout(
          checkBanExpiration,
          Math.min(remaining + 1000, 2147483647)
        );
        return;
      }

      // ====================================
      // BAN EXPIRED
      // ====================================

      await updateDoc(userRef, {
        status: "active",
        banUntil: null,
        updatedAt: serverTimestamp()
      });

      console.log(
        "Temporary ban expired. Account reactivated."
      );

      window.dispatchEvent(
        new Event("princesstg:ban-expired")
      );

    } catch (error) {
      console.warn(
        "Could not check or clear expired ban:",
        error
      );

      // Retry while this page remains open.
      expiryTimer = setTimeout(
        checkBanExpiration,
        60000
      );
    }
  }

  void checkBanExpiration();
});
