
import { auth, db } from "./firebase.js";
import "./ban-expiry.js";

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

  element.textContent = message;
  element.style.color = error
    ? "#fca5a5"
    : "#86efac";
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

async function loadProfile(user) {
  const snapshot = await getDocFromServer(
    accountRef(user)
  );

  if (!snapshot.exists()) {
    throw new Error(
      "Your user record has not been created yet. Refresh after registration finishes."
    );
  }

  account = user;
  accountData = snapshot.data();

  $("profile-app").hidden = false;

  renderAccount();
  await loadSubmissions(user);
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
        error.message,
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
        `Email change failed: ${error.message}`,
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
      `Unable to load songs: ${error.message}`,
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
        `Could not update subscription: ${error.message}`,
        true
      );

    } finally {
      button.disabled = !isActive();
    }
  }
);

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
      "Your Firebase login will be permanently deleted.\n" +
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

      // Delete the actual Firebase Auth login.
      await deleteUser(account);

      window.location.replace(
        new URL("../index.html", import.meta.url).href
      );

    } catch (error) {
      setStatus(
        "close-account-status",
        `Closure failed: ${error.message}. ` +
        (accountData.status === "archived"
          ? "Your profile is archived, but login deletion may still need completion. You can retry here."
          : "Your account has not been archived by this attempt."),
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


// ==========================================
// AUTHENTICATION STATE
// ==========================================

onAuthStateChanged(auth, async user => {
  $("profile-app").hidden = true;


if (!user) {
  window.location.replace(
    new URL("../index.html", import.meta.url).href
  );

  return;
}


  try {
    setStatus(
      "profile-status",
      "Loading your account..."
    );

    await loadProfile(user);

  } catch (error) {
    setStatus(
      "profile-status",
      `Could not load profile: ${error.message}`,
      true
    );
  }
});
