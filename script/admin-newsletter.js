import {app, auth} from "./firebase.js";
import {getFunctions, httpsCallable} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";

const fn = httpsCallable(getFunctions(app, "us-central1"), "newsletterAdmin");
const $ = id => document.getElementById(id);
let messages = [];
let busy = false;

async function call(action, other = {}) {
  const result = await fn({action,...other});
  return result.data;
}
function status(message, error = false) {
  $("newsletter-status").textContent = message;
  $("newsletter-status").style.color = error ? "#fca5a5" : "#86efac";
}
function button(label, click, className = "secondary") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = label;
  b.addEventListener("click", click);
  return b;
}
function convertLocal(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString().slice(0,16);
}
function displayDate(iso) {
  return iso ? new Date(iso).toLocaleString() : "Not scheduled";
}
function updateFields() {
  const kind = $("newsletter-kind").value;
  $("newsletter-subject-wrap").hidden = kind !== "advert";
  $("newsletter-date-wrap").hidden = kind !== "planned";
  $("newsletter-date").required = kind === "planned";
  $("newsletter-subject").required = kind === "advert";
}
function clearForm() {
  $("newsletter-message-form").reset();
  $("newsletter-message-id").value = "";
  $("newsletter-active").checked = true;
  updateFields();
}
function selectMessage(m) {
  $("newsletter-message-id").value = m.id;
  $("newsletter-kind").value = m.kind;
  $("newsletter-title").value = m.title || "";
  $("newsletter-subject").value = m.subject || "";
  $("newsletter-body").value = m.body || "";
  $("newsletter-date").value = convertLocal(m.scheduledFor);
  $("newsletter-active").checked = m.active === true;
  updateFields();
  $("newsletter-title").focus();
}
async function refresh() {
  status("Loading newsletter settings...");
  try {
    const result = await call("list");
    messages = result.messages || [];
    $("newsletter-subscriber-count").textContent = result.newsletterSubscribers ?? 0;
    $("newsletter-promo-count").textContent = result.promotionalSubscribers ?? 0;
    $("newsletter-queued-count").textContent = result.queuedSongs?.length ?? 0;
    $("newsletter-auto-enabled").checked = result.sundayEnabled === true;
    $("newsletter-auto-enabled").disabled = !result.isOwner;
    $("newsletter-auto-save").disabled = !result.isOwner;
    renderSongs(result.queuedSongs || []);
    renderMessages(messages);
    renderCampaigns(result.campaigns || []);
    status("Newsletter data loaded.");
  } catch (e) {
    status(`Could not load newsletter: ${e.message}`, true);
  }
}
function renderSongs(songs) {
  const list = $("newsletter-song-list");
  list.replaceChildren();
  if (!songs.length) { list.textContent = "No songs are queued for Sunday yet."; return; }
  for (const s of songs) {
    const row = document.createElement("div"); row.className = "newsletter-item";
    const label = document.createElement("span"); label.textContent = s.title;
    const remove = button("Remove from next newsletter", async () => {
      if (!confirm(`Remove “${s.title}” from the queued newsletter? This does NOT delete the song.`)) return;
      try { await call("queueSong", {id:s.id,queued:false}); await refresh(); }
      catch (e) { status(e.message,true); }
    });
    row.append(label,remove); list.append(row);
  }
}
function renderMessages(items) {
  const list = $("newsletter-message-list"); list.replaceChildren();
  if (!items.length) list.textContent = "No saved messages yet. Create your first rotating message below.";
  for (const m of items) {
    const row = document.createElement("div"); row.className = "newsletter-item";
    const text = document.createElement("div");
    const h = document.createElement("strong"); h.textContent = m.title;
    const sub = document.createElement("small");
    sub.textContent = `${m.kind} | ${m.active ? "Active" : "Inactive"}${m.kind === "planned" ? ` | ${displayDate(m.scheduledFor)}` : ""}`;
    text.append(h,sub);
    const controls = document.createElement("div");controls.className="newsletter-item-actions";
    controls.append(button("Edit",()=>selectMessage(m)),button("Delete",async()=>{
      if (!confirm(`Permanently delete the saved message “${m.title}”?`)) return;
      try { await call("delete",{id:m.id});clearForm();await refresh(); }
      catch (e) { status(e.message,true); }
    }));
    row.append(text,controls);list.append(row);
  }
  const select = $("newsletter-advert-choice"); const before = select.value;
  select.replaceChildren(new Option("Select a saved advert...", ""));
  for (const m of items.filter(x => x.kind === "advert" && x.active)) {
    select.add(new Option(m.title,m.id));
  }
  if ([...select.options].some(x=>x.value === before))select.value = before;
}
function renderCampaigns(items) {
  const list = $("newsletter-campaign-list");list.replaceChildren();
  if (!items.length) {list.textContent="No campaigns have been sent yet.";return;}
  for (const c of items) {
    const row = document.createElement("div"); row.className="newsletter-item";
    const div = document.createElement("div");
    const strong = document.createElement("strong");strong.textContent=c.subject || c.id;
    const small = document.createElement("small");
    small.textContent=`${c.type} | ${c.status} | ${c.sentCount ?? 0}/${c.recipientCount ?? 0} sent | ${c.failedCount ?? 0} failed`;
    div.append(strong,small);row.append(div);list.append(row);
  }
}
function setBusy(v) {
  busy = v;
  for (const id of ["newsletter-save","newsletter-test","newsletter-advert-test","newsletter-advert-send"]) {
    $(id).disabled = v;
  }
}
async function perform(task) {
  if (busy) return;
  setBusy(true);
  try { await task(); }
  catch (e) { status(e.message,true); }
  finally {setBusy(false);}
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!$("newsletter-admin")) return;
  $("newsletter-kind").addEventListener("change",updateFields);
  $("newsletter-new").addEventListener("click",clearForm);
  $("newsletter-refresh").addEventListener("click",refresh);
  $("newsletter-auto-save").addEventListener("click",()=>perform(async()=>{
    const enabled=$("newsletter-auto-enabled").checked;
    if(enabled && !confirm("Enable real automatic newsletter delivery to opted-in subscribers every Sunday at 9:00 AM Central?")) {
      await refresh();return;
    }
    const result=await call("setSundayEnabled",{enabled});
    await refresh();
    status(result.enabled ? "Automatic Sunday delivery is now ENABLED." : "Automatic Sunday delivery is OFF.");
  }));
  $("newsletter-message-form").addEventListener("submit",event => {
    event.preventDefault();
    perform(async () => {
      const kind = $("newsletter-kind").value;
      let scheduledFor = null;
      if (kind === "planned") {
        const date = new Date($("newsletter-date").value);
        if (!Number.isFinite(date.getTime()))throw new Error("Choose a valid planned date and time");
        scheduledFor = date.toISOString();
      }
      await call("save",{
        id:$("newsletter-message-id").value || null,
        kind,title:$("newsletter-title").value,subject:$("newsletter-subject").value,
        body:$("newsletter-body").value,active:$("newsletter-active").checked,
        scheduledFor
      });
      clearForm();await refresh();status("Message saved successfully.");
    });
  });
  $("newsletter-test").addEventListener("click",()=>perform(async()=>{
    if (!confirm("Send ONE test of the next weekly newsletter to your own signed-in email?"))return;
    status("Sending test newsletter...");
    const result=await call("test");
    status(`Exactly one test was sent to ${result.sentTo}. No queue was consumed.`);
  }));
  $("newsletter-advert-test").addEventListener("click",()=>perform(async()=>{
    const advertId=$("newsletter-advert-choice").value;
    if (!advertId)throw new Error("Select a saved advert first");
    status("Sending one advert test...");
    const result=await call("test",{advertId});
    status(`Exactly one advert test sent to ${result.sentTo}.`);
  }));
  $("newsletter-advert-send").addEventListener("click",()=>perform(async()=>{
    const id=$("newsletter-advert-choice").value;
    if (!id)throw new Error("Select a saved advert first");
    const m=messages.find(x=>x.id===id);
    if (!confirm(`SEND THIS ADVERTISEMENT TO ALL PROMOTION-OPTED-IN SUBSCRIBERS?\n\n${m?.title || id}\n\nThis is a real bulk email campaign and cannot be unsent.`))return;
    status("Starting promotional campaign...");
    const result=await call("sendAdvert",{id});
    await refresh();
    status(`Advertisement queued for ${result.queuedRecipients} opted-in subscriber(s). Check Recent Email Campaigns for delivery status.`);
  }));
  updateFields();
  await auth.authStateReady();
  await refresh();
});
