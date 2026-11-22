"use strict";
// Server-only mailbox. Firestore documents are accessed through authenticated
// Callable Functions; never grant users direct access to these collections.
const {Buffer} = require("node:buffer");

const MAIL = "siteMailMessages";
const BOXES = "siteMailboxes";
const RATE = "siteMailSendRate";
const DAYS = 30;
const EXPIRY_MS = DAYS * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 30;
const MAX_IMAGES = 3;
const IMAGE_BYTES = 150000;
const IMAGE_TOTAL = 450000;
const MAX_TRACKS = 150;
const name = value => String(value || "").trim().replace(/\s+/g," ").slice(0,90);
const text = value => String(value || "").trim();
const hex = value => /^#[0-9a-f]{6}$/i.test(value || "") ? String(value).toLowerCase() : "#8b5cf6";
const validKey = key => typeof key === "string" && key.length <= 230 &&
  (/^song:[a-z0-9._-]{1,130}$/i.test(key) ||
   (key.startsWith("audio/") && /\.mp3$/i.test(key) &&
    !key.includes("..") && !key.includes("\\") &&
    !/[?#\x00-\x1f]/.test(key)));
const messageRef = (db,id) => db.collection(MAIL).doc(id);
const boxRef = (db,uid,box,id) => db.collection(BOXES).doc(uid).collection(box).doc(id);
const liveStatus = data => {
  const status=data?.status || "active";
  if(status==="active")return true;
  if(status!=="banned")return false;
  const until=data?.banUntil?.toMillis?.();
  return Number.isFinite(until)&&until<=Date.now();
};
function safeShare(input,fail){
  if(input==null)return null;
  if(!input||typeof input!=="object"||Array.isArray(input))fail("invalid-argument","Invalid song or playlist.");
  const kind=input.kind;
  if(kind==="song"){
    if(!validKey(input.key))fail("invalid-argument","Song selection is invalid.");
    return {kind:"song",key:input.key,title:name(input.title||input.key)};
  }
  if(kind==="playlist"){
    const playlistName=name(input.name);
    if(!playlistName)fail("invalid-argument","Playlist name is required.");
    if(!Array.isArray(input.tracks)||!input.tracks.length||input.tracks.length>MAX_TRACKS||
      input.tracks.some(key=>!validKey(key))) {
      fail("invalid-argument","Playlists can contain 1 to 150 valid site songs.");
    }
    const tracks=[...new Set(input.tracks)];
    return {kind:"playlist",name:playlistName,color:hex(input.color),tracks};
  }
  fail("invalid-argument","Only site songs and playlists can be shared.");
}
function safeImages(input,fail){
  if(input==null)return [];
  if(!Array.isArray(input)||input.length>MAX_IMAGES)
    fail("invalid-argument","Attach at most three image files.");
  let total=0;
  return input.map(item=>{
    if(!item||typeof item!=="object")fail("invalid-argument","Invalid image attachment.");
    const dataUrl=String(item.dataUrl||"");
    const match=/^data:image\/(jpeg|png|webp);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(dataUrl);
    if(!match||match[2].length>220000)fail("invalid-argument","Only PNG, JPEG or WebP images are allowed. Audio and other files are blocked.");
    const buffer=Buffer.from(match[2],"base64");
    if(!buffer.length||buffer.length>IMAGE_BYTES)
      fail("invalid-argument","Each image must be under 150 KB after compression.");
    const kind=match[1];
    const signatureOk=kind==="png"?
      buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
      kind==="jpeg"?buffer.length>3&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255:
      buffer.length>12&&buffer.toString("ascii",0,4)==="RIFF"&&buffer.toString("ascii",8,12)==="WEBP";
    if(!signatureOk)fail("invalid-argument","Image contents do not match the image type.");
    total+=buffer.length;
    const display=name(item.name||"Image").slice(0,80);
    return {name:display||"Image",dataUrl};
  }).filter(Boolean).map((entry,index,all)=>{
    if(index===all.length-1&&total>IMAGE_TOTAL)
      fail("invalid-argument","Images exceed the combined 450 KB limit.");
    return entry;
  });
}
const envelope = (d,uid,box) => ({
  senderUid:d.senderUid,recipientUid:d.recipientUid,
  senderName:d.senderName,recipientName:d.recipientName,
  subject:d.subject,hasImage:d.images.length>0,
  shareKind:d.share?.kind||null,imageCount:d.images.length,
  createdAt:d.createdAt,expiresAt:d.expiresAt,
  readAt:box==="inbox"?null:d.createdAt
});
const summary = snap => {
  const d=snap.data();
  return {id:snap.id,senderUid:d.senderUid,recipientUid:d.recipientUid,
    senderName:d.senderName,recipientName:d.recipientName,
    subject:d.subject,hasImage:!!d.hasImage,shareKind:d.shareKind||null,
    imageCount:d.imageCount||0,createdAt:d.createdAt?.toMillis?.()||0,
    expiresAt:d.expiresAt?.toMillis?.()||0,read:!!d.readAt};
};
async function limitSending(db,uid,Timestamp,fail){
  const ref=db.collection(RATE).doc(uid);
  const now=Date.now();
  await db.runTransaction(async transaction=>{
    const snap=await transaction.get(ref);
    const state=snap.data()||{};
    const minStart=now-Number(state.minuteStart||0)<60000?state.minuteStart:now;
    const dayStart=now-Number(state.dayStart||0)<86400000?state.dayStart:now;
    const minuteCount=(minStart===state.minuteStart?Number(state.minuteCount||0):0)+1;
    const dayCount=(dayStart===state.dayStart?Number(state.dayCount||0):0)+1;
    if(minuteCount>8||dayCount>50)
      fail("resource-exhausted","Mail limit reached. Please try again later.");
    transaction.set(ref,{minuteStart:minStart,minuteCount,
      dayStart,dayCount,updatedAt:Timestamp.fromMillis(now)});
  });
}
async function handle(req,{db,Timestamp,HttpsError,crypto}){
  const fail=(code,message)=>{throw new HttpsError(code,message);};
  const uid=req.auth?.uid;
  if(!uid)fail("unauthenticated","Sign in to use site mail.");
  const action=String(req.data?.action||"");
  if(!["search","send","list","read","delete"].includes(action))
    fail("invalid-argument","Unknown mail action.");

  if(action==="search"){
    const query=text(req.data.query).replace(/\s+/g," ");
    if(query.length<2)return {users:[]};
    if(query.length>45)fail("invalid-argument","Search must be 45 characters or less.");
    // Existing accounts have display names but no normalized public index yet.
    // Lookup common capitalization variants without exposing emails.
    const queries=[query,query.charAt(0).toUpperCase()+query.slice(1)];
    const results=await Promise.all([...new Set(queries)].map(term=>
      db.collection("users").orderBy("auth.displayName").startAt(term)
        .endAt(term+"\uf8ff").limit(10).get()));
    const map=new Map();
    results.forEach(result=>result.docs.forEach(snap=>{
      if(snap.id===uid||!liveStatus(snap.data()))return;
      const display=name(snap.data()?.auth?.displayName);
      if(display)map.set(snap.id,{uid:snap.id,name:display});
    }));
    return {users:[...map.values()].slice(0,12)};
  }

  if(action==="send"){
    const recipientUid=text(req.data.recipientUid);
    if(!/^[a-zA-Z0-9_-]{8,140}$/.test(recipientUid))
      fail("invalid-argument","Select a recipient from the user search.");
    const subject=text(req.data.subject);
    const body=text(req.data.body);
    if(!subject||subject.length>120||body.length>6000)
      fail("invalid-argument","Subject must be 1–120 characters and message 6,000 characters or less.");
    const share=safeShare(req.data.share,fail);
    const images=safeImages(req.data.images,fail);
    if(!body&&!share&&!images.length)
      fail("invalid-argument","Write a message or attach a song, playlist or image.");
    const [senderSnap,recipientSnap]=await Promise.all([
      db.collection("users").doc(uid).get(),
      db.collection("users").doc(recipientUid).get()
    ]);
    if(!senderSnap.exists||!liveStatus(senderSnap.data()))
      fail("permission-denied","Your account cannot send mail.");
    if(!recipientSnap.exists||!liveStatus(recipientSnap.data()))
      fail("not-found","That recipient is unavailable.");
    await limitSending(db,uid,Timestamp,fail);
    const now=Date.now();
    const id=crypto.randomUUID();
    const data={senderUid:uid,recipientUid,
      senderName:name(senderSnap.data()?.auth?.displayName)||"Site member",
      recipientName:name(recipientSnap.data()?.auth?.displayName)||"Site member",
      subject,body,share,images,
      createdAt:Timestamp.fromMillis(now),expiresAt:Timestamp.fromMillis(now+EXPIRY_MS)
    };
    const batch=db.batch();
    batch.create(messageRef(db,id),data);
    batch.create(boxRef(db,recipientUid,"inbox",id),envelope(data,recipientUid,"inbox"));
    batch.create(boxRef(db,uid,"sent",id),envelope(data,uid,"sent"));
    await batch.commit();
    return {id,sentAt:now,expiresAt:now+EXPIRY_MS};
  }
  const box=req.data.box==="sent"?"sent":"inbox";
  if(action==="list"){
    const coll=db.collection(BOXES).doc(uid).collection(box);
    let query=coll.orderBy("createdAt","desc").limit(PAGE_SIZE);
    const cursor=text(req.data.cursor);
    if(cursor){
      if(!/^[a-f0-9-]{36}$/i.test(cursor))fail("invalid-argument","Invalid page cursor.");
      const last=await coll.doc(cursor).get();
      if(!last.exists)fail("failed-precondition","The mail list changed. Refresh it.");
      query=query.startAfter(last);
    }
    const snap=await query.get();
    const now=Date.now();
    const items=snap.docs.filter(doc=>doc.data().expiresAt?.toMillis?.()>now).map(summary);
    return {messages:items,nextCursor:snap.size===PAGE_SIZE?snap.docs[snap.docs.length-1].id:null};
  }
  const id=text(req.data.id);
  if(!/^[a-f0-9-]{36}$/i.test(id))fail("invalid-argument","Invalid mail ID.");
  const ref=boxRef(db,uid,box,id);
  const snap=await ref.get();
  if(!snap.exists)fail("not-found","Message not found, or it was deleted.");
  if(snap.data().expiresAt?.toMillis?.()<=Date.now())
    fail("not-found","This message expired after 30 days.");
  if(action==="delete"){
    await ref.delete();
    return {deleted:true};
  }
  const original=await messageRef(db,id).get();
  if(!original.exists)fail("not-found","Message no longer exists.");
  const d=original.data();
  if(d.expiresAt?.toMillis?.()<=Date.now())fail("not-found","This message has expired.");
  if((box==="inbox"&&d.recipientUid!==uid)||(box==="sent"&&d.senderUid!==uid))
    fail("permission-denied","You cannot view this message.");
  if(box==="inbox"&&!snap.data().readAt){
    await ref.update({readAt:Timestamp.now()});
  }
  return {mail:{...summary(snap),
    body:d.body||"",share:d.share||null,images:d.images||[],
    read:true}};
}
async function cleanup({db,Timestamp,logger}){
  const now=Timestamp.now();
  let count=0;
  for(let round=0;round<4;round++){
    const expired=await db.collection(MAIL).where("expiresAt","<=",now).limit(120).get();
    if(expired.empty)break;
    const batch=db.batch();
    for(const snap of expired.docs){
      const d=snap.data();
      batch.delete(boxRef(db,d.senderUid,"sent",snap.id));
      batch.delete(boxRef(db,d.recipientUid,"inbox",snap.id));
      batch.delete(snap.ref);
    }
    await batch.commit();
    count+=expired.size;
    if(expired.size<120)break;
  }
  logger.info("Expired in-site mail and images purged",{count});
  return {deleted:count};
}
module.exports={handle,cleanup,safeShare,safeImages,validKey,liveStatus};
