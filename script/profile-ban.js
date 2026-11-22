
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

import {
  doc,
  getDocFromServer,
  onSnapshot,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

// ==========================================
// PROFILE BAN AND APPEAL SYSTEM
// ==========================================

const $ = id => document.getElementById(id);

const section = $("profile-ban-section");
const remainingDisplay = $("ban-time-remaining");

const appealButton = $("ban-appeal-open");
const appealForm = $("ban-appeal-form");
const appealMessage = $("ban-appeal-message");
const appealSubmit = $("ban-appeal-submit");
const appealCancel = $("ban-appeal-cancel");
const appealStatus = $("ban-appeal-status");

let currentUser = null;
let accountData = null;
let currentBanId = null;

let appealLoaded = false;
let appealSubmitted = false;
let saving = false;

let stopAccountListener = () => {};
let lookupVersion = 0;

// ==========================================
// BAN HELPERS
// ==========================================

function banIdFor(data) {
  return typeof data?.banId === "string" &&
    data.banId.trim()
      ? data.banId
      : "legacy";
}

function activeBan(data) {
  if (data?.status !== "banned") {
    return false;
  }

  // No expiry means indefinite.
  if (!data.banUntil) return true;

  const end = data.banUntil.toMillis?.();

  if (!Number.isFinite(end)) return true;

  return end > Date.now();
}

function formatRemaining(ms) {
  const total = Math.ceil(ms / 60000);

  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;

  return [
    days ? `${days}d` : "",
    hours ? `${hours}h` : "",
    `${minutes}m`
  ].filter(Boolean).join(" ");
}

// ==========================================
// UPDATE BAN TIMER AND APPEAL BUTTON
// ==========================================

function renderBan() {
  const banned = activeBan(accountData);

  section.hidden = !banned;

  if (!banned) {
    appealForm.hidden = true;
    return;
  }

  const end = accountData.banUntil?.toMillis?.();

  if (!Number.isFinite(end)) {
    remainingDisplay.textContent =
      "Indefinite Ban - No Expiration Date";
  } else {
    remainingDisplay.textContent =
      formatRemaining(end - Date.now());
  }

  appealButton.hidden =
    !appealLoaded || appealSubmitted;

  appealButton.disabled = saving;

  appealSubmit.disabled =
    saving || appealSubmitted;

  if (!appealLoaded) {
    appealStatus.textContent =
      "Checking appeal eligibility...";
  } else if (appealSubmitted) {
    appealForm.hidden = true;

    appealStatus.textContent =
      "Your appeal has already been submitted. " +
      "Only one appeal is permitted for this ban.";
  } else if (
    appealStatus.textContent ===
    "Checking appeal eligibility..."
  ) {
    appealStatus.textContent = "";
  }
}

// ==========================================
// CHECK WHETHER THIS BAN WAS APPEALED
// ==========================================

async function checkExistingAppeal(user, banId) {
  const version = ++lookupVersion;

  appealLoaded = false;
  appealSubmitted = false;

  renderBan();

  try {
    const appealRef = doc(
      db,
      "users",
      user.uid,
      "banAppeals",
      banId
    );

    const snapshot =
      await getDocFromServer(appealRef);

    if (
      version !== lookupVersion ||
      auth.currentUser?.uid !== user.uid ||
      currentBanId !== banId
    ) {
      return;
    }

    appealSubmitted = snapshot.exists();
    appealLoaded = true;

    renderBan();

  } catch (error) {
    console.error(
      "Appeal lookup failed:",
      error
    );

    if (version !== lookupVersion) return;

    appealStatus.textContent =
      "Could not check existing appeals. " +
      "Please refresh the page.";
  }
}

// ==========================================
// OPEN / CLOSE APPEAL EDITOR
// ==========================================

appealButton.addEventListener("click", () => {
  if (
    !activeBan(accountData) ||
    !appealLoaded ||
    appealSubmitted
  ) {
    return;
  }

  appealForm.hidden = false;
  appealButton.hidden = true;
  appealMessage.focus();
});

appealCancel.addEventListener("click", () => {
  appealForm.hidden = true;
  appealButton.hidden = false;
});

// ==========================================
// SUBMIT ONE APPEAL PER BAN
// ==========================================

appealForm.addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    if (
      !currentUser ||
      !activeBan(accountData) ||
      !appealLoaded ||
      appealSubmitted ||
      saving
    ) {
      return;
    }

    const message = appealMessage.value.trim();

    if (message.length < 20 || message.length > 3000) {
      appealStatus.textContent =
        "Appeal must contain 20 to 3,000 characters.";
      return;
    }

    if (!window.confirm(
      "Submit your ban appeal?\n\n" +
      "You can submit only ONE appeal for this ban. " +
      "You cannot edit or replace it afterward."
    )) {
      return;
    }

    saving = true;
    renderBan();

    try {
      const user = currentUser;
      const banId = currentBanId;

      // Refresh account state before submitting.
      const accountSnapshot =
        await getDocFromServer(
          doc(db, "users", user.uid)
        );

      if (
        !accountSnapshot.exists() ||
        !activeBan(accountSnapshot.data()) ||
        banIdFor(accountSnapshot.data()) !== banId
      ) {
        throw new Error(
          "This ban is no longer active. Refresh the page."
        );
      }

      await setDoc(
        doc(
          db,
          "users",
          user.uid,
          "banAppeals",
          banId
        ),
        {
          uid: user.uid,
          banId,
          message,
          status: "pending",
          createdAt: serverTimestamp()
        }
      );

      appealSubmitted = true;
      appealForm.hidden = true;
      appealMessage.value = "";

      renderBan();

    } catch (error) {
      console.error(
        "Appeal submission failed:",
        error
      );

      appealStatus.textContent =
        `Could not submit appeal: ${error.message}`;

    } finally {
      saving = false;
      renderBan();
    }
  }
);

// ==========================================
// WATCH ACCOUNT FOR BAN CHANGES
// ==========================================

onAuthStateChanged(auth, user => {
  stopAccountListener();
  stopAccountListener = () => {};

  ++lookupVersion;

  currentUser = user;
  accountData = null;
  currentBanId = null;
  appealLoaded = false;
  appealSubmitted = false;

  section.hidden = true;

  if (!user) return;

  stopAccountListener = onSnapshot(
    doc(db, "users", user.uid),

    snapshot => {
      if (!snapshot.exists()) {
        section.hidden = true;
        return;
      }

      accountData = snapshot.data();

      if (!activeBan(accountData)) {
        currentBanId = null;
        section.hidden = true;
        return;
      }

      const banId = banIdFor(accountData);

      if (currentBanId !== banId) {
        currentBanId = banId;

        appealForm.hidden = true;
        appealMessage.value = "";

        void checkExistingAppeal(user, banId);
      }

      renderBan();
    },

    error => {
      console.error(
        "Ban status listener failed:",
        error
      );

      section.hidden = true;
    }
  );
});

// ==========================================
// REFRESH EVERY 60 SECONDS
// ==========================================

setInterval(renderBan, 60000);

// Correct the countdown after switching tabs.
document.addEventListener(
  "visibilitychange",
  () => {
    if (!document.hidden) {
      renderBan();
    }
  }
);
