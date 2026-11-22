import {app,auth} from "./firebase.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {getPlaylists,createPlaylist,addToPlaylistControl,songLink} from "./music-playlists.js";
import {loadAllSongs} from "./song-data.js";

// Mail stays on the server. The browser never directly reads private mail
// documents or writes recipients' records in Firestore.
const call=httpsCallable(getFunctions(app,"us-central1"),"siteMail");
const api=async(action,args={})=>(await call({action,...args})).data;
const $=id=>document.getElementById(id);
const folders=["inbox","sent","compose"];
const tab=$("profile-tab-mail");
let view="inbox",selectedId="",selectedRecipient=null;
let messages={inbox:[],sent:[]},cursors={inbox:null,sent:null};
let renderedBox="inbox",share=null,images=[],catalog=null,recipientRequest=0;
let searchTimer=null,busy=false;
const setStatus=(message,isError=false)=>{
  const el=$("mail-status");el.textContent=message;
  el.dataset.error=isError?"true":"false";
};
function element(tag,cls,body){
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(body!==undefined)el.textContent=body;
  return el;
}
function safeTime(ms){
  if(!Number.isFinite(ms)||ms<=0)return "Date unavailable";
  return new Date(ms).toLocaleString(undefined,{year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
}
const errorMessage=error=>{
  const msg=String(error?.message||"Request failed");
  return msg.replace(/^.*?siteMail:\s*/,"").slice(0,240);
};
function unreadCount(){
  return messages.inbox.filter(m=>!m.read).length;
}
function updateUnread(){
  const count=unreadCount();
  const header=$("profile-mail-unread"),folder=$("mail-unread-count");
  for(const el of [header,folder]){el.hidden=count===0;el.textContent=count?String(count):"";}
}
function chooseView(next,refresh=true){
  if(!folders.includes(next))next="inbox";
  view=next;
  $("mail-browser").hidden=next==="compose";
  $("mail-compose-form").hidden=next!=="compose";
  for(const name of folders)$("mail-"+name+"-button").setAttribute("aria-pressed",String(name===next));
  if(next==="compose"){
    $("mail-recipient-search").focus();
  }else{
    renderedBox=next;
    $("mail-folder-title").textContent=next==="sent"?"Sent messages":"Inbox";
    closeReader();
    if(refresh)void refreshFolder(next);
    else drawList();
  }
}
function closeReader(){
  selectedId="";
  $("mail-browser").classList.remove("mail-reader-active");
  $("mail-reader-empty").hidden=false;
  $("mail-reader-open").hidden=true;
}
function makeMailRow(mail){
  const row=element("button","mail-row");
  row.type="button";row.dataset.id=mail.id;
  row.classList.toggle("mail-row-unread",renderedBox==="inbox"&&!mail.read);
  row.classList.toggle("mail-row-selected",selectedId===mail.id);
  const top=element("div","mail-row-top");
  const peer=element("strong","mail-row-peer",
    renderedBox==="inbox"?mail.senderName:mail.recipientName);
  const stamp=element("time","mail-row-date",safeTime(mail.createdAt));
  stamp.dateTime=mail.createdAt?new Date(mail.createdAt).toISOString():"";
  top.append(peer,stamp);
  const subject=element("span","mail-row-subject",mail.subject);
  const extras=element("small","mail-row-extras",
    [mail.shareKind==="song"?"Song":mail.shareKind==="playlist"?"Playlist":"",
      mail.hasImage?mail.imageCount+" picture(s)":""].filter(Boolean).join(" · "));
  row.append(top,subject);
  if(extras.textContent)row.append(extras);
  row.addEventListener("click",()=>void openMail(mail.id));
  return row;
}
function drawList(){
  const root=$("mail-message-list");root.replaceChildren();
  const items=messages[renderedBox];
  $("mail-list-empty").hidden=items.length>0;
  for(const mail of items)root.append(makeMailRow(mail));
  $("mail-load-more").hidden=!cursors[renderedBox];
  $("mail-delete-all").disabled=items.length===0;
  updateUnread();
}
async function refreshFolder(folder,append=false){
  if(!auth.currentUser)return;
  const uid=auth.currentUser.uid;
  const cursor=append?cursors[folder]:null;
  $("mail-refresh").disabled=true;
  setStatus(append?"Loading older messages...":"Loading "+(folder==="sent"?"sent mail":"inbox")+"...");
  try{
    const data=await api("list",{box:folder,cursor});
    if(auth.currentUser?.uid!==uid)return;
    if(append){
      const seen=new Set(messages[folder].map(m=>m.id));
      messages[folder].push(...data.messages.filter(m=>!seen.has(m.id)));
    }else messages[folder]=data.messages;
    cursors[folder]=data.nextCursor;
    if(view===folder)drawList();
    else updateUnread();
    setStatus("");
  }catch(error){
    setStatus("Cannot load mail: "+errorMessage(error),true);
  }finally{$("mail-refresh").disabled=false;}
}
function makeSharedContent(saved){
  const section=element("div","mail-share-card");
  if(saved.kind==="song"){
    section.append(element("strong","","♫ Shared song: "+(saved.title||saved.key)));
    const key=saved.key||"";
    let id=key.replace(/^song:/,"");
    if(key.startsWith("audio/"))id=key.split("/").pop().replace(/\.[^.]+$/,"")
      .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
    const anchor=element("a","","Open song");
    anchor.href=songLink(id);section.append(anchor);
    section.append(addToPlaylistControl(()=>[key],{label:"+ Add to my playlist"}));
  }else if(saved.kind==="playlist"){
    section.style.setProperty("--shared-color",saved.color||"#8b5cf6");
    section.append(element("strong","","≡ Playlist: "+saved.name));
    section.append(element("p","",saved.tracks?.length+" songs · shared from site"));
    const save=element("button","","Save to my playlists");save.type="button";
    save.addEventListener("click",()=>{
      try{
        let candidate=saved.name,count=1;
        const existing=new Set(getPlaylists().map(p=>p.name.toLowerCase()));
        while(existing.has(candidate.toLowerCase())){
          candidate=saved.name+" (shared"+(count++>1?" "+(count-1):"")+")";
        }
        createPlaylist(candidate,saved.tracks||[],saved.color);
        save.disabled=true;save.textContent="Saved to your playlists";
        setStatus("Playlist saved to your browser. Find it in the Playlists tab.");
      }catch(error){setStatus(errorMessage(error),true);}
    });
    section.append(save);
  }
  return section;
}
async function openMail(id){
  if(!auth.currentUser)return;
  const box=renderedBox;
  selectedId=id;drawList();
  setStatus("Opening message...");
  try{
    const response=await api("read",{box,id});
    if(box!==renderedBox||selectedId!==id)return;
    const mail=response.mail;
    const found=messages[box].find(item=>item.id===id);
    if(found)found.read=true;
    $("mail-reader-empty").hidden=true;$("mail-reader-open").hidden=false;
    $("mail-browser").classList.add("mail-reader-active");
    $("mail-open-subject").textContent=mail.subject;
    $("mail-open-person-label").textContent=box==="inbox"?"From":"To";
    $("mail-open-person").textContent=box==="inbox"?mail.senderName:mail.recipientName;
    $("mail-open-date").textContent=safeTime(mail.createdAt);
    $("mail-open-expiry").textContent=safeTime(mail.expiresAt);
    $("mail-open-body").textContent=mail.body||"(No message text)";
    $("mail-reply").hidden=box!=="inbox";
    $("mail-reply").dataset.recipientUid=mail.senderUid;
    $("mail-reply").dataset.recipientName=mail.senderName;
    $("mail-reply").dataset.subject=mail.subject;
    const shared=$("mail-open-share");shared.replaceChildren();
    shared.hidden=!mail.share;
    if(mail.share)shared.append(makeSharedContent(mail.share));
    const gallery=$("mail-open-images");gallery.replaceChildren();
    for(const [index,item] of (mail.images||[]).entries()){
      const anchor=element("a","mail-image-item");
      anchor.href=item.dataUrl;
      anchor.download=item.name||("photo-"+(index+1)+".jpg");
      anchor.title="Download "+(item.name||"image");
      const picture=document.createElement("img");
      picture.src=item.dataUrl;
      picture.alt=item.name||"Picture attachment";
      picture.loading="lazy";picture.decoding="async";
      anchor.append(picture,element("span","",item.name||"Picture "+(index+1)));
      gallery.append(anchor);
    }
    drawList();setStatus("");
  }catch(error){
    selectedId="";drawList();
    setStatus("Cannot open message: "+errorMessage(error),true);
  }
}
async function deleteMessage(){
  if(!selectedId)return;
  const item=messages[renderedBox].find(m=>m.id===selectedId);
  if(!window.confirm("Delete '"+(item?.subject||"this message")+"' from your "+renderedBox+"? The other member keeps their copy until they delete it or it expires."))return;
  try{
    await api("delete",{box:renderedBox,id:selectedId});
    messages[renderedBox]=messages[renderedBox].filter(m=>m.id!==selectedId);
    closeReader();drawList();setStatus("Message deleted from your "+renderedBox+".");
  }catch(error){setStatus("Could not delete message: "+errorMessage(error),true);}
}
async function deleteAll(){
  const box=renderedBox;
  if(!window.confirm("Permanently delete ALL messages from your "+box+"? This only removes your copy."))return;
  $("mail-delete-all").disabled=true;
  try{
    let deleted=0,more=true,rounds=0;
    while(more&&rounds++<30){
      const result=await api("deleteAll",{box});
      deleted+=result.deleted;more=result.hasMore;
      setStatus("Deleting messages... "+deleted);
      if(!result.deleted)break;
    }
    if(view===box)await refreshFolder(box);
    else messages[box]=[];
    setStatus("Deleted "+deleted+" "+(box==="sent"?"sent":"inbox")+" message(s)."+
      (more?" Some older messages remain. Repeat Delete all.":""));
  }catch(error){setStatus("Could not delete mail: "+errorMessage(error),true);}
  finally{$("mail-delete-all").disabled=false;}
}
function chooseRecipient(user){
  selectedRecipient=user;
  $("mail-recipient-selected").hidden=false;
  $("mail-recipient-selected-name").textContent=user.name;
  $("mail-recipient-search").hidden=true;
  $("mail-recipient-results").hidden=true;
  $("mail-recipient-results").replaceChildren();
}
function clearRecipient(){
  selectedRecipient=null;
  $("mail-recipient-selected").hidden=true;
  $("mail-recipient-search").hidden=false;
  $("mail-recipient-search").value="";
  $("mail-recipient-search").focus();
}
async function findUsers(textValue){
  const token=++recipientRequest;
  if(textValue.trim().length<2){
    $("mail-recipient-results").hidden=true;return;
  }
  try{
    const result=await api("search",{query:textValue.trim()});
    if(token!==recipientRequest||selectedRecipient)return;
    const root=$("mail-recipient-results");root.replaceChildren();
    for(const user of result.users){
      const button=element("button","",user.name);
      button.type="button";
      button.addEventListener("click",()=>chooseRecipient(user));
      root.append(button);
    }
    if(!result.users.length)root.append(element("p","","No matching members found."));
    root.hidden=false;
  }catch(error){
    setStatus("Recipient search unavailable: "+errorMessage(error),true);
  }
}
function showShare(){
  $("mail-share-preview").hidden=!share;
  $("mail-share-name").textContent=!share?"":share.kind==="song"?
    "♫ "+share.title:"≡ "+share.name+" ("+share.tracks.length+" songs)";
}
function addShare(item){
  share=item;showShare();
  $("mail-song-chooser").hidden=true;
  $("mail-playlist-chooser").hidden=true;
  setStatus("Attached "+(item.kind==="song"?"song":"playlist")+".");
}
async function ensureCatalog(){
  if(catalog)return catalog;
  try{
    catalog=await loadAllSongs("../audioPlayer/audio/song-details.json");
  }catch(error){
    setStatus("Song catalog unavailable: "+errorMessage(error),true);
    catalog=[];
  }
  return catalog;
}
async function filterSongs(){
  const songs=await ensureCatalog();
  const term=$("mail-song-search").value.trim().toLowerCase();
  const filtered=songs.filter(song=>song.title?.toLowerCase().includes(term)).slice(0,12);
  const root=$("mail-song-results");root.replaceChildren();
  for(const song of filtered){
    const button=element("button","",song.title+(song.album?" · "+song.album:""));
    button.type="button";
    button.addEventListener("click",()=>{
      addShare({kind:"song",key:"song:"+song.pageId,title:song.title});
      $("mail-subject").value||=(song.title||"A song for you");
    });
    root.append(button);
  }
  if(!filtered.length)root.append(element("p","","No matching songs."));
}
function refreshPlaylistChoices(){
  const select=$("mail-playlist-select");
  select.replaceChildren(new Option("Choose one of your playlists",""));
  for(const p of getPlaylists())select.add(new Option(p.name+" ("+p.tracks.length+" songs)",p.id));
}
function resetCompose(){
  $("mail-compose-form").reset();
  selectedRecipient=null;images=[];share=null;
  $("mail-recipient-search").hidden=false;
  $("mail-recipient-selected").hidden=true;
  $("mail-recipient-results").hidden=true;
  $("mail-recipient-results").replaceChildren();
  $("mail-share-preview").hidden=true;
  $("mail-song-chooser").hidden=true;
  $("mail-playlist-chooser").hidden=true;
  $("mail-image-previews").replaceChildren();
  $("mail-body-count").textContent="0 / 6000";
}
function renderImagePreviews(){
  const root=$("mail-image-previews");root.replaceChildren();
  images.forEach((img,index)=>{
    const block=element("div","mail-image-preview");
    const picture=document.createElement("img");
    picture.src=img.dataUrl;picture.alt=img.name;picture.loading="lazy";
    const caption=element("small","",img.name);
    const remove=element("button","mail-secondary","×");
    remove.type="button";remove.setAttribute("aria-label","Remove "+img.name);
    remove.addEventListener("click",()=>{
      images.splice(index,1);renderImagePreviews();
    });
    block.append(picture,caption,remove);root.append(block);
  });
}
async function compressImage(file){
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))
    throw Error("Only JPEG, PNG and WebP pictures can be attached. Audio files are not allowed.");
  if(file.size>8*1024*1024)throw Error("Each original picture must be under 8 MB.");
  let picture,cleanup=()=>{};
  if(typeof createImageBitmap==="function"){
    picture=await createImageBitmap(file);
    cleanup=()=>picture.close?.();
  }else{
    const url=URL.createObjectURL(file);
    cleanup=()=>URL.revokeObjectURL(url);
    picture=await new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);
      image.onerror=()=>reject(Error("This picture could not be opened."));
      image.src=url;
    });
  }
  try{
    const width=picture.width||picture.naturalWidth;
    const height=picture.height||picture.naturalHeight;
    if(!width||!height)throw Error("Invalid picture dimensions.");
    let scale=Math.min(1,1400/Math.max(width,height));
    const canvas=document.createElement("canvas");
    const blob=async quality=>new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
    for(let attempt=0;attempt<10;attempt++){
      canvas.width=Math.max(1,Math.floor(width*scale));
      canvas.height=Math.max(1,Math.floor(height*scale));
      const ctx=canvas.getContext("2d");
      if(!ctx)throw Error("Image compression is unavailable in this browser.");
      ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(picture,0,0,canvas.width,canvas.height);
      const encoded=await blob(Math.max(.37,.84-attempt*.06));
      if(encoded&&encoded.size<=140000){
        const dataUrl=await new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=()=>resolve(reader.result);
          reader.onerror=()=>reject(Error("Image conversion failed."));
          reader.readAsDataURL(encoded);
        });
        return {name:file.name.replace(/\.[^.]+$/,"")+".jpg",dataUrl};
      }
      scale*=.78;
    }
    throw Error("This picture is too large even after compression.");
  }finally{cleanup();}
}
async function attachImages(files){
  if(!files?.length)return;
  const available=3-images.length;
  if(files.length>available){
    setStatus("You can attach up to three pictures per message.",true);return;
  }
  $("mail-images-input").disabled=true;
  try{
    for(const file of files){
      setStatus("Preparing picture: "+file.name);
      const item=await compressImage(file);
      images.push(item);
    }
    renderImagePreviews();
    setStatus(images.length+" picture(s) ready.");
  }catch(error){setStatus(errorMessage(error),true);}
  finally{$("mail-images-input").disabled=false;$("mail-images-input").value="";}
}
function beginCompose(recipient=null,subject=""){
  resetCompose();
  if(recipient)chooseRecipient(recipient);
  if(subject)$("mail-subject").value=subject;
  tab.click();
  chooseView("compose",false);
}
function applyShareIntent(){
  const params=new URLSearchParams(location.search);
  let intent=false;
  const song=params.get("mailSong");
  if(song&&(/^song:[a-z0-9._-]{1,130}$/i.test(song))){
    share={kind:"song",key:song,title:params.get("mailTitle")?.slice(0,90)||song.slice(5)};
    showShare();intent=true;
  }
  if(params.get("mailCompose")==="1"){
    const raw=sessionStorage.getItem("princesstg:mail-share-playlist");
    sessionStorage.removeItem("princesstg:mail-share-playlist");
    if(raw){
      try{
        const selected=JSON.parse(raw);
        if(selected.kind==="playlist"&&Array.isArray(selected.tracks)&&selected.tracks.length){
          share=selected;showShare();intent=true;
        }
      }catch{}
    }
    intent=true;
  }
  if(intent){
    tab.click();chooseView("compose",false);
    const url=new URL(location.href);
    for(const key of ["mailSong","mailTitle","mailCompose"])url.searchParams.delete(key);
    history.replaceState(null,"",url.pathname+url.search+url.hash);
  }
}

$("mail-new").addEventListener("click",()=>beginCompose());
for(const name of folders)$("mail-"+name+"-button").addEventListener("click",()=>{
  if(name==="compose")beginCompose();
  else chooseView(name);
});
$("mail-refresh").addEventListener("click",()=>void refreshFolder(renderedBox));
$("mail-load-more").addEventListener("click",()=>void refreshFolder(renderedBox,true));
$("mail-back").addEventListener("click",closeReader);
$("mail-delete").addEventListener("click",()=>void deleteMessage());
$("mail-delete-all").addEventListener("click",()=>void deleteAll());
$("mail-reply").addEventListener("click",event=>{
  const data=event.currentTarget.dataset;
  beginCompose({uid:data.recipientUid,name:data.recipientName},
    data.subject?.toLowerCase().startsWith("re:")?data.subject:"Re: "+data.subject);
});
$("mail-cancel").addEventListener("click",()=>{resetCompose();chooseView("inbox",false);});
$("mail-recipient-search").addEventListener("input",event=>{
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>void findUsers(event.target.value),250);
});
$("mail-recipient-clear").addEventListener("click",clearRecipient);
$("mail-body").addEventListener("input",event=>{
  $("mail-body-count").textContent=event.target.value.length+" / 6000";
});
$("mail-add-song").addEventListener("click",()=>{
  $("mail-song-chooser").hidden=!$("mail-song-chooser").hidden;
  $("mail-playlist-chooser").hidden=true;
  if(!$("mail-song-chooser").hidden)void filterSongs();
});
$("mail-song-search").addEventListener("input",()=>void filterSongs());
$("mail-add-playlist").addEventListener("click",()=>{
  $("mail-playlist-chooser").hidden=!$("mail-playlist-chooser").hidden;
  $("mail-song-chooser").hidden=true;
  if(!$("mail-playlist-chooser").hidden)refreshPlaylistChoices();
});
$("mail-playlist-attach").addEventListener("click",()=>{
  const value=$("mail-playlist-select").value;
  const selected=getPlaylists().find(p=>p.id===value);
  if(!selected){setStatus("Choose a playlist to attach.",true);return;}
  if(!selected.tracks.length){setStatus("Empty playlists cannot be shared.",true);return;}
  if(selected.tracks.length>150){setStatus("Playlists can share up to 150 songs.",true);return;}
  addShare({kind:"playlist",name:selected.name,color:selected.color,tracks:[...selected.tracks]});
  $("mail-subject").value||=selected.name+" playlist";
});
$("mail-share-remove").addEventListener("click",()=>{share=null;showShare();});
$("mail-images-input").addEventListener("change",event=>{
  void attachImages([...event.target.files]);
});
$("mail-compose-form").addEventListener("submit",async event=>{
  event.preventDefault();
  if(busy)return;
  if(!selectedRecipient){setStatus("Choose a member from the recipient search.",true);return;}
  const subject=$("mail-subject").value.trim();
  const body=$("mail-body").value.trim();
  if(!subject||(!body&&!share&&!images.length)){
    setStatus("Add a subject and write a message or attach something.",true);return;
  }
  busy=true;$("mail-send").disabled=true;
  setStatus("Sending your site mail...");
  try{
    const result=await api("send",{
      recipientUid:selectedRecipient.uid,subject,body,share,images
    });
    resetCompose();chooseView("sent");
    setStatus("Mail sent! It will automatically expire "+safeTime(result.expiresAt)+".");
  }catch(error){setStatus("Could not send mail: "+errorMessage(error),true);}
  finally{busy=false;$("mail-send").disabled=false;}
});
tab.addEventListener("click",()=>{
  if(view!=="compose"&&auth.currentUser)void refreshFolder(view);
});
window.addEventListener("princesstg:mail-share",event=>{
  if(!auth.currentUser){setStatus("Sign in to send mail.",true);return;}
  const item=event.detail;
  if(!item||!["song","playlist"].includes(item.kind))return;
  beginCompose();
  addShare(item);
  $("mail-subject").value=item.kind==="playlist"
    ?item.name+" playlist":item.title||"A song for you";
});
onAuthStateChanged(auth,user=>{
  messages={inbox:[],sent:[]};cursors={inbox:null,sent:null};
  closeReader();updateUnread();
  if(!user){setStatus("Sign in to use site mail.");return;}
  void refreshFolder("inbox");
  applyShareIntent();
});
