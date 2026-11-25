import {publicError} from "./site-errors.js";
import { auth, db } from "./firebase.js";
import { verifyStaff } from "./staff-auth.js";

import {
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

// ==========================================
// PRINCESSTG STAFF INBOX
// Automatically lists appeals from every user.
// Reading a message saves a receipt for the
// current staff member only.
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {
  const $ = id => document.getElementById(id);
  const root = $("admin-inbox");
  if (!root) return;

  const names = ["appeals", "billing", "feedback", "flagged"];
  const tabs = Object.fromEntries(names.map(name => [
    name, $("inbox-tab-" + name)
  ]));
  const panels = Object.fromEntries(names.map(name => [
    name, $("inbox-panel-" + name)
  ]));
  const list = $("inbox-appeal-list");
  const detail = $("inbox-appeal-detail");
  const status = $("inbox-appeal-status");

  let activeTab = "appeals";
  let staffUid = null;
  let appeals = [];
  let accounts = new Map();
  let readKeys = new Set();
  let selectedKey = null;
  let usersReady = false;
  let appealsReady = false;
  let readsReady = false;
  let loadError = null;
  const reading = new Set();
  const unsubscribe = [];

  function el(tag, text, className) {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  }

  function dateText(value) {
    const d = value?.toDate?.();
    return d instanceof Date && Number.isFinite(d.getTime())
      ? d.toLocaleString()
      : "Date pending";
  }

  function accountName(account, uid) {
    return account?.auth?.displayName?.trim() ||
      account?.auth?.email || uid;
  }

  function accountEmail(account) {
    return account?.auth?.email || "Not available";
  }

  function accountStatus(account) {
    if (!account) return "Account not found";
    if (account.status !== "banned") {
      return account.status || "active";
    }
    const until = account.banUntil?.toMillis?.();
    if (Number.isFinite(until) && until <= Date.now()) {
      return "Ban expired";
    }
    return account.banUntil
      ? `Banned until ${dateText(account.banUntil)}`
      : "Banned indefinitely";
  }

  // Receipt path: staffInboxReads/{staffUid}/appeals/{uid__banId}
  function appealKey(appeal) {
    return `${appeal.uid}__${appeal.banId}`;
  }

  function unread(appeal) {
    return !readKeys.has(appealKey(appeal));
  }

  function updateTabs() {
    const counts = {
      appeals: appealsReady && readsReady
        ? appeals.filter(unread).length
        : 0,
      billing: 0,
      feedback: 0,
      flagged: 0
    };

    for (const name of names) {
      const tab = tabs[name];
      const selected = name === activeTab;
      const number = counts[name];
      tab.classList.toggle("is-active", selected);
      tab.classList.toggle("has-unread", number > 0);
      tab.setAttribute("aria-selected", String(selected));
      panels[name].hidden = !selected;

      const badge = tab.querySelector(".inbox-unread-count");
      if (badge) {
        badge.hidden = number === 0;
        badge.textContent = number ? String(number) : "";
      }
    }
    return counts.appeals;
  }

  for (const name of names) {
    tabs[name].addEventListener("click", () => {
      activeTab = name;
      updateTabs();
    });
  }
  updateTabs();

  function orderedAppeals() {
    return [...appeals].sort((a, b) =>
      (b.createdAt?.toMillis?.() || 0) -
      (a.createdAt?.toMillis?.() || 0)
    );
  }

  function appendField(grid, label, value) {
    grid.append(el("dt", label), el("dd", value));
  }

  function renderDetail() {
    detail.replaceChildren();
    const appeal = appeals.find(a => appealKey(a) === selectedKey);
    if (!appeal) {
      detail.append(el("p", "Select an appeal on the left to read it.", "helper"));
      return;
    }

    const account = accounts.get(appeal.uid);
    const title = el("h4", `Appeal from ${accountName(account, appeal.uid)}`);
    const info = el("dl", undefined, "inbox-details-grid");

    appendField(info, "Email", accountEmail(account));
    appendField(info, "Account UID", appeal.uid);
    appendField(info, "Account role", account?.role || "user");
    appendField(info, "Account status", accountStatus(account));
    appendField(info, "Ban ID", appeal.banId);
    appendField(info, "Received", dateText(appeal.createdAt));
    appendField(info, "Appeal status", appeal.status || "pending");

    const messageHeading = el("h4", "Full Appeal Message");
    const message = el("div", appeal.message || "(Empty message)", "inbox-full-message");

    // textContent is used throughout: submitted text is not executable HTML.
    detail.append(title, info, messageHeading, message);
  }

  function renderInbox() {
    const unreadCount = updateTabs();

    if (loadError) {
      status.textContent = `Could not load inbox: ${loadError}`;
      list.replaceChildren(el("p", "Unable to load messages.", "inbox-empty"));
      renderDetail();
      return;
    }

    if (!usersReady || !appealsReady || !readsReady) {
      status.textContent = "Loading appeals…";
      return;
    }

    status.textContent = `${appeals.length} received · ${unreadCount} unread`;
    list.replaceChildren();

    if (!appeals.length) {
      list.append(el("p", "No appeals have been submitted yet.", "inbox-empty"));
      renderDetail();
      return;
    }

    for (const appeal of orderedAppeals()) {
      const account = accounts.get(appeal.uid);
      const key = appealKey(appeal);
      const item = el("button", undefined, "inbox-message-item");
      item.type = "button";
      item.classList.toggle("is-selected", selectedKey === key);
      item.classList.toggle("is-unread", unread(appeal));
      item.setAttribute("aria-label", `Open appeal from ${accountName(account, appeal.uid)}`);

      const row = el("span", undefined, "inbox-item-top");
      row.append(el("span", accountName(account, appeal.uid), "inbox-item-sender"));
      if (unread(appeal)) row.append(el("span", "NEW", "inbox-new-pill"));

      const date = el("small", dateText(appeal.createdAt), "inbox-item-date");
      const preview = el("span", appeal.message || "(Empty message)", "inbox-item-preview");
      item.append(row, date, preview);
      item.addEventListener("click", () => void openAppeal(key));
      list.append(item);
    }

    renderDetail();
  }

  async function openAppeal(key) {
    selectedKey = key;
    renderInbox();

    const appeal = appeals.find(a => appealKey(a) === key);
    if (!appeal || !unread(appeal) || !staffUid || reading.has(key)) return;
    reading.add(key);

    try {
      // Per-staff read receipt. Appeal itself stays immutable.
      await setDoc(
        doc(db, "staffInboxReads", staffUid, "appeals", key),
        {
          uid: appeal.uid,
          banId: appeal.banId,
          readAt: serverTimestamp()
        }
      );
      readKeys.add(key);
      renderInbox();
    } catch (error) {
      console.error("Could not mark appeal as read:", error);
      status.textContent =
        publicError(error,"PTG-901");
    } finally {
      reading.delete(key);
    }
  }

  try {
    await auth.authStateReady();
    if (!(await verifyStaff())) {
      throw new Error("Administrator or owner access required.");
    }
    staffUid = auth.currentUser.uid;

    // Accounts are needed to show name, email and current ban status.
    unsubscribe.push(onSnapshot(
      collection(db, "users"),
      snapshot => {
        accounts = new Map(snapshot.docs.map(record => [record.id, record.data()]));
        usersReady = true;
        renderInbox();
      },
      error => {
        loadError = publicError(error,"PTG-901");
        renderInbox();
      }
    ));

    // Automatically receive all appeals from every user's subcollection.
    // No search or manual refreshing is necessary.
    unsubscribe.push(onSnapshot(
      collectionGroup(db, "banAppeals"),
      snapshot => {
        appeals = snapshot.docs.map(record => ({
          ...record.data(),
          uid: record.ref.parent.parent?.id || record.data().uid,
          banId: record.id
        }));
        appealsReady = true;
        renderInbox();
      },
      error => {
        loadError = publicError(error,"PTG-901");
        renderInbox();
      }
    ));

    unsubscribe.push(onSnapshot(
      collection(db, "staffInboxReads", staffUid, "appeals"),
      snapshot => {
        readKeys = new Set(snapshot.docs.map(record => record.id));
        readsReady = true;
        renderInbox();
      },
      error => {
        loadError = publicError(error,"PTG-901");
        renderInbox();
      }
    ));
  } catch (error) {
    console.error("Admin inbox initialization failed:", error);
    loadError = publicError(error,"PTG-901");
    renderInbox();
  }

  window.addEventListener("pagehide", () => {
    for (const stop of unsubscribe) stop();
  }, { once: true });
});
