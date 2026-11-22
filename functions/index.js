"use strict";

// PrincessTG Music weekly newsletters and promotional mail.
// Deploy server-side ONLY. Never put the Resend API key in GitHub Pages.
const crypto = require("node:crypto");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue, Timestamp} = require("firebase-admin/firestore");
const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {defineSecret} = require("firebase-functions/params");
const {logger} = require("firebase-functions");

initializeApp();
const db = getFirestore();
const API_KEY = defineSecret("RESEND_API_KEY");
const UNSUB_SECRET = defineSecret("NEWSLETTER_UNSUBSCRIBE_SECRET");
const REGION = "us-central1";
const SITE = (process.env.PUBLIC_SITE_URL ||
  "https://princess8815.github.io/PrincessTGMusic").replace(/\/$/, "");
const FROM = process.env.NEWSLETTER_FROM || "";
const ADDRESS = process.env.NEWSLETTER_POSTAL_ADDRESS || "";
const UNSUB_URL = process.env.UNSUBSCRIBE_ENDPOINT ||
  "https://us-central1-music-and-poetry.cloudfunctions.net/newsletterUnsubscribe";
const secretOptions = [API_KEY, UNSUB_SECRET];
const VALID_KINDS = new Set(["rotating", "planned", "advert"]);
const MESSAGES = "newsletterMessages";
const CAMPAIGNS = "newsletterCampaigns";
const MAX_SUBSCRIBERS = 10000;

function checkConfigured() {
  if (!FROM.includes("@") || !ADDRESS.trim() || !SITE.startsWith("https://")) {
    throw new Error("Configure NEWSLETTER_FROM, NEWSLETTER_POSTAL_ADDRESS and PUBLIC_SITE_URL before sending.");
  }
  if (!API_KEY.value() || !UNSUB_SECRET.value()) {
    throw new Error("Set RESEND_API_KEY and NEWSLETTER_UNSUBSCRIBE_SECRET secrets before sending.");
  }
}
function clean(value, max) {
  return String(value ?? "").trim().slice(0, max);
}
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function asDate(ts) {
  return ts && typeof ts.toDate === "function" ? ts.toDate() : null;
}
function sortOldest(a, b) {
  return (asDate(a.lastUsedAt)?.getTime() || 0) -
    (asDate(b.lastUsedAt)?.getTime() || 0) ||
    (asDate(a.createdAt)?.getTime() || 0) - (asDate(b.createdAt)?.getTime() || 0);
}
function weekDateChicago(now = new Date()) {
  // Stable YYYY-MM-DD regardless of the runtime's locale formatting.
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const x = Object.fromEntries(p.filter(t => t.type !== "literal")
    .map(t => [t.type, t.value]));
  return `${x.year}-${x.month}-${x.day}`;
}
function sundayPreviewTime(now = new Date()) {
  // Preview may include a planned message due by the NEXT Sunday.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", weekday: "short", year: "numeric",
    month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23"
  }).formatToParts(now);
  const vals = Object.fromEntries(parts.filter(x => x.type !== "literal")
    .map(x => [x.type, x.value]));
  const day = new Date(Date.UTC(+vals.year, +vals.month - 1, +vals.day));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(vals.weekday);
  const offset = (7 - dow) % 7 || (+vals.hour >= 9 ? 7 : 0);
  day.setUTCDate(day.getUTCDate() + offset);
  // 15:00 UTC covers 9AM CST; use an inclusive preview bound to avoid
  // incorrectly omitting planned messages on the Sunday boundary.
  day.setUTCHours(16, 0, 0, 0);
  return day;
}
async function requireStaff(req) {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Please log in.");
  const snap = await db.collection("users").doc(req.auth.uid).get();
  const data = snap.data() || {};
  if (!["owner", "admin"].includes(data.role) ||
      (data.status || "active") !== "active") {
    throw new HttpsError("permission-denied", "Active staff access required.");
  }
  return {uid: req.auth.uid, email: req.auth.token.email,role:data.role};
}
function validEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}
function signedUnsub(uid, mode) {
  const sig = crypto.createHmac("sha256", UNSUB_SECRET.value())
    .update(`${uid}|${mode}`).digest("hex");
  return `${UNSUB_URL}?uid=${encodeURIComponent(uid)}&mode=${mode}&sig=${sig}`;
}
function goodSignature(uid, mode, sig) {
  if (!/^[a-f0-9]{64}$/.test(sig || "")) return false;
  const expected = crypto.createHmac("sha256", UNSUB_SECRET.value())
    .update(`${uid}|${mode}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"));
}
function renderMail({subject, intro, planned = [], songs = [], advert = false}, uid) {
  const mode = advert ? "promo" : "weekly";
  const unsub = signedUnsub(uid, mode);
  const head = `${advert ? "Advertisement from" : "News from"} PrincessTG Music`;
  const blocks = [intro, ...planned.map(x => x.body)].filter(Boolean);
  const text = [head, "", ...blocks, songs.length ? "Songs in this issue:" : "",
    ...songs.map(s => `• ${s.title}: ${s.url}`), "",
    `Mailing address: ${ADDRESS}`, `Unsubscribe: ${unsub}`].filter(Boolean).join("\n\n");
  const paragraphs = blocks.map(x => `<p style="white-space:pre-line;line-height:1.65">${esc(x)}</p>`).join("");
  const links = songs.map(s => `<li style="margin:10px 0"><a href="${esc(s.url)}" style="color:#a78bfa">${esc(s.title)}</a></li>`).join("");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#111827;color:#f9fafb;font:16px Arial,sans-serif"><div style="max-width:650px;margin:auto;padding:26px;border:1px solid #374151;border-radius:12px;background:#1f2937"><h1 style="color:#c084fc">PrincessTG Music</h1>${advert ? '<p><strong>Advertisement</strong></p>' : ""}<h2>${esc(subject)}</h2>${paragraphs}${links ? `<h3>Featured Songs</h3><ul>${links}</ul>` : ""}<hr style="border:0;border-top:1px solid #374151;margin:28px 0"><p style="font-size:12px;color:#cbd5e1">${esc(ADDRESS)}<br><a href="${esc(unsub)}" style="color:#c4b5fd">Unsubscribe from ${advert ? "promotions" : "weekly updates"}</a></p></div></body></html>`;
  return {text, html, unsub};
}
async function sendProviderEmail({to, subject, intro, planned = [], songs = [], advert = false, uid, key}) {
  checkConfigured();
  if (!validEmail(to)) throw new Error("Invalid recipient email");
  const {text, html, unsub} = renderMail({subject, intro, planned, songs, advert}, uid);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY.value()}`,
      "Content-Type": "application/json",
      "Idempotency-Key": key
    },
    body: JSON.stringify({
      from: FROM, to: [to], subject, html, text,
      headers: {
        "List-Unsubscribe": `<${unsub}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
      }
    })
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Email provider error ${response.status}: ${body.slice(0, 250)}`);
  }
  return JSON.parse(body).id;
}
async function selectContent(dueThrough) {
  const [messagesSnap, songsSnap] = await Promise.all([
    db.collection(MESSAGES).where("active", "==", true).get(),
    db.collection("songs").where("newsletterQueued", "==", true).get()
  ]);
  const messages = messagesSnap.docs.map(d => ({id: d.id, ...d.data()}));
  const rotating = messages.filter(m => m.kind === "rotating").sort(sortOldest)[0] || null;
  const planned = messages.filter(m => m.kind === "planned" &&
    asDate(m.scheduledFor) && asDate(m.scheduledFor).getTime() <= dueThrough.getTime())
    .sort((a,b) => asDate(a.scheduledFor) - asDate(b.scheduledFor));
  const songs = songsSnap.docs.map(d => ({
    id: d.id, title: clean(d.data().title || d.id, 160),
    url: `${SITE}/audioPlayer/pages/song.html?id=${encodeURIComponent(d.id)}`
  })).sort((a,b) => a.title.localeCompare(b.title));
  return {rotating, planned, songs};
}
function weeklyContent(selection) {
  const intro = selection.rotating?.body || "";
  return {
    subject: `PrincessTG Music | Weekly Update`, intro,
    planned: selection.planned.map(m => ({body: m.body, id:m.id})),
    songs: selection.songs, advert: false
  };
}
async function activeSubscribers(mode) {
  const field = mode === "advert" ? "promotionsSubscribed" : "newsletterSubscribed";
  const snap = await db.collection("users").where(field, "==", true)
    .limit(MAX_SUBSCRIBERS + 1).get();
  if (snap.size > MAX_SUBSCRIBERS) {
    throw new Error("Subscriber safety limit exceeded; increase MAX_SUBSCRIBERS after reviewing provider limits.");
  }
  return snap.docs.filter(d => {
    const u = d.data();
    return (u.status || "active") === "active" && validEmail(u.auth?.email);
  }).map(d => ({uid:d.id,email:d.data().auth.email}));
}
async function createCampaign(id, kind, content, staffUid, source = {}) {
  checkConfigured();
  const ref = db.collection(CAMPAIGNS).doc(id);
  const subscribers = await activeSubscribers(kind);
  const existing = await db.runTransaction(async tx => {
    const s = await tx.get(ref);
    if (s.exists) return true;
    tx.create(ref, {
      type:kind, status:"preparing", ...content, createdBy:staffUid,
      createdAt:FieldValue.serverTimestamp(),
      recipientCount:subscribers.length, sentCount:0, failedCount:0,
      skippedCount:0, ...source
    });
    return false;
  });
  if (existing) return {alreadyExists:true, count:0};
  // Use one document per recipient: supports retries and unsubscribe checks.
  for (let i = 0; i < subscribers.length; i += 300) {
    const batch = db.batch();
    for (const s of subscribers.slice(i, i + 300)) {
      batch.create(ref.collection("recipients").doc(s.uid), {
        email:s.email, status:"pending", attempts:0, createdAt:FieldValue.serverTimestamp()
      });
    }
    await batch.commit();
  }
  await ref.update({status:"queued", preparedAt:FieldValue.serverTimestamp()});
  return {alreadyExists:false, count:subscribers.length};
}
async function startWeeklyCampaign(now = new Date()) {
  checkConfigured();
  const id = `weekly-${weekDateChicago(now)}`;
  if ((await db.collection(CAMPAIGNS).doc(id).get()).exists) return {alreadyExists:true};
  const selected = await selectContent(now);
  if ((await activeSubscribers("weekly")).length === 0) {
    logger.info("No opted-in, active newsletter recipients yet; keeping queued content.");
    return {noSubscribers:true};
  }
  if (!selected.rotating && !selected.planned.length && !selected.songs.length) {
    logger.info("Skipping empty weekly newsletter", {id});
    return {empty:true};
  }
  const content = weeklyContent(selected);
  const created = await createCampaign(id, "weekly", content, "scheduler", {
    selectedRotatingId: selected.rotating?.id || null,
    selectedPlannedIds: selected.planned.map(m => m.id),
    selectedSongIds: selected.songs.map(s => s.id)
  });
  if (created.alreadyExists) return created;
  // Consume only after a campaign is durably queued.
  for (const s of selected.songs) {
    const ref = db.collection("songs").doc(s.id);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.data().newsletterQueued === true) {
        tx.update(ref, {newsletterQueued:false, newsletterIncludedAt:Timestamp.fromDate(now)});
      }
    });
  }
  for (const m of [selected.rotating, ...selected.planned].filter(Boolean)) {
    const updates = {lastUsedAt:Timestamp.fromDate(now)};
    if (m.kind === "planned") updates.active = false;
    await db.collection(MESSAGES).doc(m.id).update(updates);
  }
  return {id, ...created};
}
async function claimRecipient(ref) {
  const now = Date.now();
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const d = snap.data();
    const eligible = d.status === "pending" ||
      (d.status === "retry" && (!d.nextAttemptAt || d.nextAttemptAt.toMillis() <= now)) ||
      (d.status === "sending" && d.leaseUntil?.toMillis() < now);
    if (!eligible) return null;
    tx.update(ref, {
      status:"sending", attempts:FieldValue.increment(1),
      leaseUntil:Timestamp.fromMillis(now + 120000),
      updatedAt:FieldValue.serverTimestamp()
    });
    return {uid:ref.id,email:d.email,attempts:(d.attempts || 0) + 1};
  });
}
async function processCampaign(campaignId, max = 15) {
  checkConfigured();
  const ref = db.collection(CAMPAIGNS).doc(campaignId);
  const snap = await ref.get();
  if (!snap.exists || !["queued", "sending"].includes(snap.data().status)) return;
  const campaign = snap.data();
  await ref.update({status:"sending"});
  const jobs = await ref.collection("recipients")
    .where("status", "in", ["pending", "retry", "sending"]).limit(120).get();
  let attempted = 0;
  for (const job of jobs.docs) {
    if (attempted >= max) break;
    const claim = await claimRecipient(job.ref);
    if (!claim) continue;
    attempted++;
    try {
      const current = await db.collection("users").doc(claim.uid).get();
      const user = current.data() || {};
      const opted = campaign.type === "advert" ? user.promotionsSubscribed === true :
        user.newsletterSubscribed === true;
      if (!opted || (user.status || "active") !== "active" ||
          !validEmail(user.auth?.email) || user.auth.email !== claim.email) {
        await job.ref.update({status:"skipped", leaseUntil:null,
          skippedReason:"unsubscribed, banned, archived or email changed"});
        await ref.update({skippedCount:FieldValue.increment(1)});
        continue;
      }
      const emailId = await sendProviderEmail({
        to:claim.email, uid:claim.uid, key:`${campaignId}-${claim.uid}`,
        subject:campaign.subject, intro:campaign.intro,
        planned:campaign.planned || [],songs:campaign.songs || [],
        advert:campaign.type === "advert"
      });
      await job.ref.update({status:"sent", emailId,
        sentAt:FieldValue.serverTimestamp(),leaseUntil:null});
      await ref.update({sentCount:FieldValue.increment(1)});
    } catch (e) {
      logger.warn("Newsletter delivery failed", {campaignId, recipient:claim.uid, error:String(e)});
      const failed = claim.attempts >= 5;
      await job.ref.update({
        status: failed ? "failed" : "retry", lastError:String(e).slice(0,300),
        nextAttemptAt:Timestamp.fromMillis(Date.now() + Math.min(3600000, 60000 * 2 ** claim.attempts)),
        leaseUntil:null
      });
      if (failed) await ref.update({failedCount:FieldValue.increment(1)});
    }
  }
  const pending = await ref.collection("recipients")
    .where("status", "in", ["pending", "retry", "sending"]).limit(1).get();
  if (pending.empty) {
    const latest = (await ref.get()).data();
    await ref.update({status:latest.failedCount ? "completed_with_errors":"completed",
      completedAt:FieldValue.serverTimestamp()});
  }
}

// ==========================================
// AUTHENTICATED ADMIN CONTROLS
// ==========================================
exports.newsletterAdmin = onCall({region:REGION, secrets:secretOptions,
  timeoutSeconds:120}, async req => {
  const action = clean(req.data?.action, 40);
  if (action === "setPromotionPreference") {
    if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Please log in.");
    if (typeof req.data.enabled !== "boolean") throw new HttpsError("invalid-argument","Invalid preference");
    const account = db.collection("users").doc(req.auth.uid);
    const snap = await account.get();
    if (!snap.exists || snap.data().status === "archived") {
      throw new HttpsError("failed-precondition", "Account unavailable");
    }
    await account.update({promotionsSubscribed:req.data.enabled,
      promotionsUpdatedAt:FieldValue.serverTimestamp(),
      updatedAt:FieldValue.serverTimestamp()});
    return {enabled:req.data.enabled};
  }
  const staff = await requireStaff(req);
  if (action === "setSundayEnabled") {
    if (staff.role !== "owner") {
      throw new HttpsError("permission-denied", "Only the owner can enable automatic mass email.");
    }
    if (typeof req.data.enabled !== "boolean") {
      throw new HttpsError("invalid-argument", "Invalid schedule setting");
    }
    if (req.data.enabled === true) checkConfigured();
    await db.collection("newsletterSettings").doc("current").set({
      sundayEnabled:req.data.enabled,
      updatedAt:FieldValue.serverTimestamp(),updatedBy:staff.uid
    },{merge:true});
    return {enabled:req.data.enabled};
  }
  if (action === "list") {
    const [messageDocs, queuedDocs, recentDocs, subscribers, promoSubscribers, config] = await Promise.all([
      db.collection(MESSAGES).orderBy("createdAt","desc").limit(200).get(),
      db.collection("songs").where("newsletterQueued","==",true).get(),
      db.collection(CAMPAIGNS).orderBy("createdAt","desc").limit(15).get(),
      db.collection("users").where("newsletterSubscribed","==",true).count().get(),
      db.collection("users").where("promotionsSubscribed","==",true).count().get(),
      db.collection("newsletterSettings").doc("current").get()
    ]);
    return {
      messages:messageDocs.docs.map(d => ({id:d.id,...serializeMessage(d.data())})),
      queuedSongs:queuedDocs.docs.map(d => ({id:d.id,title:d.data().title || d.id})),
      campaigns:recentDocs.docs.map(d => ({id:d.id,type:d.data().type,
        status:d.data().status,subject:d.data().subject,
        sentCount:d.data().sentCount,recipientCount:d.data().recipientCount,
        failedCount:d.data().failedCount})),
      newsletterSubscribers:subscribers.data().count,
      promotionalSubscribers:promoSubscribers.data().count,
      sundayEnabled:config.data()?.sundayEnabled === true,
      isOwner:staff.role === "owner"
    };
  }
  if (action === "save") {
    const kind = clean(req.data.kind, 20);
    if (!VALID_KINDS.has(kind)) throw new HttpsError("invalid-argument","Choose a valid message type");
    const title = clean(req.data.title, 100);
    const body = clean(req.data.body, 6000);
    const subject = clean(req.data.subject, 160);
    if (!title || !body || (kind === "advert" && !subject)) {
      throw new HttpsError("invalid-argument", "Title, message, and advert subject are required.");
    }
    const active = req.data.active === true;
    let scheduledFor = null;
    if (kind === "planned") {
      const date = new Date(req.data.scheduledFor);
      if (!Number.isFinite(date.getTime())) throw new HttpsError("invalid-argument", "Choose a planned date and time.");
      scheduledFor = Timestamp.fromDate(date);
    }
    const id = typeof req.data.id === "string" && /^[a-zA-Z0-9_-]{3,120}$/.test(req.data.id)
      ? req.data.id : null;
    const ref = id ? db.collection(MESSAGES).doc(id) : db.collection(MESSAGES).doc();
    if (id && !(await ref.get()).exists) throw new HttpsError("not-found", "Message no longer exists");
    await ref.set({kind,title,subject,body,active,scheduledFor,
      updatedAt:FieldValue.serverTimestamp(),updatedBy:staff.uid,
      ...(!id ? {createdAt:FieldValue.serverTimestamp()} : {})}, {merge:true});
    return {id:ref.id};
  }
  if (action === "delete") {
    const id = clean(req.data.id, 120);
    if (!/^[a-zA-Z0-9_-]{3,120}$/.test(id)) throw new HttpsError("invalid-argument", "Invalid ID");
    await db.collection(MESSAGES).doc(id).delete();
    return {ok:true};
  }
  if (action === "queueSong") {
    const id = clean(req.data.id, 180);
    if (!id || id.includes("/")) throw new HttpsError("invalid-argument", "Invalid song ID");
    const ref = db.collection("songs").doc(id);
    if (!(await ref.get()).exists) throw new HttpsError("not-found","Song was deleted");
    await ref.update({newsletterQueued:req.data.queued === true,
      newsletterQueuedAt:req.data.queued === true ? FieldValue.serverTimestamp() : null});
    return {ok:true};
  }
  if (action === "test") {
    if (!validEmail(staff.email)) throw new HttpsError("failed-precondition","Admin email missing");
    const advertId = clean(req.data.advertId, 120);
    let content;
    if (advertId) {
      const doc = await db.collection(MESSAGES).doc(advertId).get();
      if (!doc.exists || doc.data().kind !== "advert") {
        throw new HttpsError("not-found", "Choose a saved advert");
      }
      content = {subject:`[TEST] ${doc.data().subject}`,intro:doc.data().body,
        songs:[],planned:[],advert:true};
    } else {
      const selection = await selectContent(sundayPreviewTime());
      content = weeklyContent(selection);
      content.subject = `[TEST] ${content.subject}`;
      if (!selection.rotating && !selection.planned.length && !selection.songs.length) {
        throw new HttpsError("failed-precondition","Queue a song or activate a rotating/planned message first");
      }
    }
    try {
      await sendProviderEmail({...content,to:staff.email,uid:staff.uid,
        key:`test-${staff.uid}-${crypto.randomUUID()}`});
    } catch (e) {
      throw new HttpsError("internal", String(e).slice(0,350));
    }
    return {sentTo:staff.email,count:1};
  }
  if (action === "sendAdvert") {
    if (staff.role !== "owner") {
      throw new HttpsError("permission-denied", "Only the owner can send bulk advertisements.");
    }
    const id = clean(req.data.id, 120);
    const message = await db.collection(MESSAGES).doc(id).get();
    if (!message.exists || message.data().kind !== "advert" || !message.data().active) {
      throw new HttpsError("failed-precondition","Select an active saved advertisement");
    }
    const campaignId = `advert-${crypto.randomUUID()}`;
    const body = message.data();
    const created = await createCampaign(campaignId,"advert", {
      subject:body.subject,intro:body.body,planned:[],songs:[],advert:true
    },staff.uid,{sourceMessageId:id});
    await processCampaign(campaignId, 8);
    return {campaignId,queuedRecipients:created.count};
  }
  throw new HttpsError("invalid-argument", "Unknown newsletter action");
});
function serializeMessage(m) {
  return {kind:m.kind,title:m.title,subject:m.subject,body:m.body,active:m.active,
    scheduledFor:asDate(m.scheduledFor)?.toISOString() || null,
    lastUsedAt:asDate(m.lastUsedAt)?.toISOString() || null};
}

// ==========================================
// SUNDAY, 9AM CENTRAL TIME
// ==========================================
exports.sundayNewsletter = onSchedule({schedule:"0 9 * * 0",
  timeZone:"America/Chicago",region:REGION,secrets:secretOptions,
  timeoutSeconds:540}, async () => {
  try {
    const config = await db.collection("newsletterSettings").doc("current").get();
    if (config.data()?.sundayEnabled !== true) {
      logger.info("Automatic Sunday newsletter is disabled by the owner.");
      return;
    }
    const result = await startWeeklyCampaign();
    logger.info("Sunday newsletter result", result);
    if (result.id) await processCampaign(result.id, 15);
  } catch (e) {
    logger.error("Sunday newsletter failed",e);
    throw e;
  }
});

// ==========================================
// BACKGROUND SENDER AND RETRY WORKER
// ==========================================
async function recoverPreparingCampaigns() {
  const candidates = await db.collection(CAMPAIGNS)
    .where("status", "==", "preparing").limit(10).get();
  for (const doc of candidates.docs) {
    const data = doc.data();
    if (!data.createdAt || Date.now() - data.createdAt.toMillis() < 180000) continue;
    // Recover an interrupted setup. No messages are sent while preparing.
    const recipients = await activeSubscribers(data.type);
    for (let i = 0; i < recipients.length; i += 300) {
      const batch = db.batch();
      for (const r of recipients.slice(i, i + 300)) {
        const child = doc.ref.collection("recipients").doc(r.uid);
        if (!(await child.get()).exists) {
          batch.create(child, {email:r.email,status:"pending",attempts:0,
            createdAt:FieldValue.serverTimestamp()});
        }
      }
      await batch.commit();
    }
    await doc.ref.update({status:"queued",preparedAt:FieldValue.serverTimestamp(),
      recipientCount:recipients.length});
    logger.warn("Recovered interrupted newsletter campaign", {campaign:doc.id});
  }
}
exports.newsletterDeliveryWorker = onSchedule({schedule:"every 5 minutes",
  timeZone:"America/Chicago",region:REGION,secrets:secretOptions,
  timeoutSeconds:540}, async () => {
  await recoverPreparingCampaigns();
  const active = await db.collection(CAMPAIGNS)
    .where("status","in",["queued","sending"]).limit(5).get();
  for (const campaign of active.docs) {
    await processCampaign(campaign.id, 30);
  }
});

// ==========================================
// EMAIL UNSUBSCRIBE LINK (NO LOGIN REQUIRED)
// ==========================================
exports.newsletterUnsubscribe = onRequest({region:REGION,
  secrets:[UNSUB_SECRET],cors:false}, async (req,res) => {
  const uid = String(req.query.uid || "");
  const mode = String(req.query.mode || "");
  const sig = String(req.query.sig || "");
  if (!/^[a-zA-Z0-9_-]{8,140}$/.test(uid) || !["weekly","promo"].includes(mode) ||
      !goodSignature(uid,mode,sig)) {
    res.status(400).send("Invalid or expired unsubscribe link.");
    return;
  }
  if (req.method === "GET") {
    res.status(200).set("Content-Type","text/html; charset=utf-8").send(
      `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head><body style="font:18px Arial;max-width:550px;margin:50px auto;padding:16px"><h1>PrincessTG Music</h1><p>Stop receiving ${mode === "promo" ? "promotional messages" : "weekly newsletter messages"}?</p><form method="POST"><button type="submit" style="padding:14px 22px">Unsubscribe</button></form></body></html>`
    );
    return;
  }
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");return;
  }
  // Supports mailbox one-click unsub requests (RFC 8058).
  const field = mode === "promo" ? "promotionsSubscribed" : "newsletterSubscribed";
  const updateField = mode === "promo" ? "promotionsUpdatedAt" : "newsletterUpdatedAt";
  try {
    const ref = db.collection("users").doc(uid);
    if ((await ref.get()).exists) {
      await ref.update({[field]:false,[updateField]:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp()});
    }
    res.status(200).send("You have been unsubscribed. You can close this window.");
  } catch (e) {
    logger.error("Unsubscribe failed",e);
    res.status(500).send("Unsubscribe failed. Please try again later.");
  }
});


// ==========================================
// PRIVATE IN-SITE MAIL (NOT EXTERNAL EMAIL)
// ==========================================
// These callables use Admin SDK authorization and per-user private envelopes.
// Attachments are compressed images within Firestore, never audio uploads.
const siteMailService = require("./site-mail");
exports.siteMail = onCall({region:REGION,timeoutSeconds:60,
  maxInstances:12,memory:"512MiB"}, async request =>
  siteMailService.handle(request,{db,Timestamp,HttpsError,crypto})
);
// Purge both personal mailbox copies plus inline image data after 30 days.
// The callable also refuses expired messages before the cleanup job runs.
exports.siteMailCleanup = onSchedule({
  schedule:"every 6 hours",timeZone:"Etc/UTC",region:REGION,timeoutSeconds:540
},async()=>siteMailService.cleanup({db,Timestamp,logger}));
