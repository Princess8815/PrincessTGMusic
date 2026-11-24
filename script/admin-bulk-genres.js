import {songAlbums, membershipFields, originalRelease} from "./song-albums.js";
import {auth,db} from "./firebase.js";
import {verifyStaff} from "./staff-auth.js";
import {
  collection,doc,getDocFromServer,getDocsFromServer,runTransaction,serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const $=id=>document.getElementById(id);
const SONGS_JSON="../audioPlayer/audio/song-details.json";
const GENRES_DOC=()=>doc(db,"enums","genres");
const ALBUMS_DOC=()=>doc(db,"enums","albums");
const SONGS_REF=()=>collection(db,"songs");
const MAX_PARALLEL_SAVES=4;

function clean(value){return String(value??"").trim();}
function slugify(value){
  return clean(value).toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"");
}
function isFilled(value){
  if(Array.isArray(value))return value.some(isFilled);
  return typeof value==="string"&&value.trim().length>0;
}
function hasAnyGenre(song){
  return !!song&&["genre","genres","primaryGenre","secondaryGenre","thirdGenre"]
    .some(field=>isFilled(song[field]));
}
function textNode(tag,value,cls){
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  node.textContent=value;
  return node;
}
function genreNames(values){
  if(!Array.isArray(values))throw Error("The genre collection has an invalid values list.");
  const seen=new Set();
  return values.filter(x=>typeof x==="string"&&clean(x))
    .map(clean).filter(name=>{
      const key=name.toLocaleLowerCase();
      if(seen.has(key))return false;
      seen.add(key);return true;
    }).sort((a,b)=>a.localeCompare(b));
}
async function readGenres(){
  const snapshot=await getDocFromServer(GENRES_DOC());
  const values=snapshot.exists()
    ?snapshot.data().values
    :window.PrincessTGGenres||[];
  const result=genreNames(values);
  if(!result.length)throw Error("No available genres. Add genres in the Genres tab first.");
  return result;
}
async function readApprovedAlbums(){
  const snap=await getDocFromServer(ALBUMS_DOC());
  if(!snap.exists()||!Array.isArray(snap.data().values)){
    throw Error("Cannot verify the approved album list (enums/albums).");
  }
  return new Set(snap.data().values.filter(x=>typeof x==="string"));
}
function normalizeReleaseDate(value){
  const date=clean(value);
  // Firestore's releaseDate is a machine-readable YYYY-MM-DD or "tbd".
  // The untouched JSON value stays available for public display, including
  // playful custom dates like bREAKING tHE rULES.
  return /^\d{4}-\d{2}-\d{2}$/.test(date)?date:"tbd";
}
function hasCustomReleaseDate(value){
  const date=clean(value);
  return !!date && date.toLowerCase()!=="tbd"
    && !/^\d{4}-\d{2}-\d{2}$/.test(date);
}
function createIssues(song,approvedAlbums){
  // Existing Firestore records use the update rule; only JSON-only songs
  // need to satisfy the much stricter new-song create validation.
  if(song.dbSong!==null)return [];
  const data=song.display||{};
  const issues=[];
  const title=clean(song.title);
  const names=songAlbums(data);
  const album=names[0]||"";
  if(names.length>3||names.some(name=>!approvedAlbums.has(name)))issues.push("album memberships must be approved and limited to three");
  const date=normalizeReleaseDate(data.releaseDate);
  const lyrics=String(data.lyrics||"");
  const description=String(data.description||"");
  if(!title||title.length>160)
    issues.push("title must be 1–160 characters");
  if(!approvedAlbums.has(album)){
    const probable=[...approvedAlbums].find(name=>
      name.toLocaleLowerCase()===album.toLocaleLowerCase());
    issues.push("album \""+(album||"(blank)")+
      "\" is not an exact match in Firestore's approved album list"+
      (probable?" (did you mean \""+probable+"\"?)":"; add or correct it under Admin → Albums"));
  }
  if(!lyrics.trim())
    issues.push("lyrics are missing; the current Firestore create rules require lyrics");
  if(description.length>5000)
    issues.push("description is too long");
  return issues;
}
async function readUnassignedSongs(){
  // Read BOTH sources successfully before deciding a song has no genre.
  // loadAllSongs intentionally allows a Firestore outage fallback; this
  // editor cannot, since it might then overwrite a real assigned genre.
  const [response,serverSongs]=await Promise.all([
    fetch(new URL(SONGS_JSON,document.baseURI),{cache:"no-store"}),
    getDocsFromServer(SONGS_REF())
  ]);
  if(!response.ok)throw Error("Cannot load the song catalog ("+response.status+").");
  const staticSongs=await response.json();
  if(!Array.isArray(staticSongs))throw Error("Song catalog is not an array.");

  const byKey=new Map();
  for(const song of staticSongs){
    if(!song||!clean(song.title))continue;
    const id=slugify(song.pageId||song.title);
    if(!id)continue;
    byKey.set(id,{
      id,title:clean(song.title),jsonSong:song,dbSong:null,
      display:{...song,pageId:id}
    });
  }
  for(const snapshot of serverSongs.docs){
    const key=slugify(snapshot.id);
    if(!key)continue;
    const firestoreData=snapshot.data();
    const prior=byKey.get(key);
    const merged={...(prior?.display||{}),...firestoreData,pageId:snapshot.id};
    byKey.set(key,{
      id:snapshot.id,
      title:clean(merged.title)||snapshot.id,
      jsonSong:prior?.jsonSong||null,
      dbSong:firestoreData,
      display:merged
    });
  }
  return [...byKey.values()]
    .filter(song=>!hasAnyGenre(song.jsonSong)&&!hasAnyGenre(song.dbSong))
    .sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
}
function newSongDocument(song,genre,user){
  // Match the existing single-song editor's import shape so Firestore rules
  // and other admin features see an ordinary song record, not a stub.
  const source=song.display||{};
  return {
    pageId:song.id,
    title:song.title,
    description:String(source.description||""),
    ...membershipFields(songAlbums(source)),
    originalReleaseDate:originalRelease(source),
    genre,
    releaseDate:normalizeReleaseDate(source.releaseDate),
    lyrics:String(source.lyrics||""),
    translation:String(source.translation||""),
    lyricsCollapsed:source.lyricsCollapsed!==false,
    translationCollapsed:source.translationCollapsed!==false,
    submittedBy:{uid:user.uid,username:"PrincessTG"},
    createdAt:serverTimestamp(),
    updatedAt:serverTimestamp()
  };
}
async function assignMissingGenre(song,genre,user){
  const ref=doc(db,"songs",song.id);
  return runTransaction(db,async transaction=>{
    const snapshot=await transaction.get(ref);
    // This check executes inside a transaction, protecting an existing
    // assignment if another editor saved a genre since the list loaded.
    if(snapshot.exists()&&hasAnyGenre(snapshot.data()))return "skipped";
    if(snapshot.exists()){
      transaction.update(ref,{genre,updatedAt:serverTimestamp()});
    }else{
      transaction.set(ref,newSongDocument(song,genre,user));
    }
    return "saved";
  });
}

document.addEventListener("DOMContentLoaded",()=>{
  const panel=document.querySelector('[data-admin-subpanel="genres:bulk"]');
  if(!panel)return;
  const tab=document.querySelector('[data-admin-subtab="genres:bulk"]');
  const list=$("bulk-genre-list");
  const count=$("bulk-genre-count");
  const search=$("bulk-genre-search");
  const refresh=$("bulk-genre-refresh");
  const save=$("bulk-genre-save");
  const clear=$("bulk-genre-clear");
  const selectedLabel=$("bulk-genre-selected");
  const status=$("bulk-genre-status");

  let genres=[],approvedAlbums=new Set(),candidates=[],selection=new Map();
  let loading=null,ready=false,saving=false;

  function message(value,error=false){
    status.textContent=value;
    status.style.color=error?"#fca5a5":"#86efac";
  }
  function updateControls(){
    const n=selection.size;
    const readyCount=candidates.filter(song=>selection.has(song.id)
      &&createIssues(song,approvedAlbums).length===0).length;
    const blockedCount=n-readyCount;
    selectedLabel.textContent=n+" song"+(n===1?"":"s")+" selected · "+
      readyCount+" ready"+(blockedCount?" · "+blockedCount+" needs metadata fixes":"");
    save.disabled=!ready||saving||readyCount===0;
    clear.disabled=!ready||saving||n===0;
    refresh.disabled=!!loading||saving;
    search.disabled=!ready||saving;
  }
  function render(){
    list.replaceChildren();
    const query=search.value.trim().toLocaleLowerCase();
    const visible=candidates.filter(song=>
      !query || song.title.toLocaleLowerCase().includes(query)||
      String(song.display.album||"").toLocaleLowerCase().includes(query)
    );
    const blockedTotal=candidates.filter(song=>createIssues(song,approvedAlbums).length).length;
    count.textContent=candidates.length+" song"+(candidates.length===1?"":"s")+
      " without genres · "+visible.length+" shown"+
      (blockedTotal?" · "+blockedTotal+" need metadata fixes before Firestore can create them":"");
    if(!visible.length){
      const text=!candidates.length
        ?"All songs have a genre! Nothing to assign."
        :"No unassigned songs match this search.";
      list.append(textNode("p",text,"bulk-genre-empty"));
      updateControls();return;
    }
    const fragment=document.createDocumentFragment();
    visible.forEach((song,index)=>{
      const row=document.createElement("div");
      row.className="bulk-genre-row";row.setAttribute("role","listitem");
      row.dataset.selected=String(selection.has(song.id));
      const meta=document.createElement("div");
      meta.append(
        textNode("strong",song.title),
        textNode("small","Album: "+(clean(song.display.album)||"Uncategorized"))
      );
      const issues=createIssues(song,approvedAlbums);
      if(issues.length){
        const warning=textNode("small","Cannot create Firestore record yet: "+
          issues.join("; ")+".","bulk-genre-warning");
        warning.setAttribute("role","note");
        meta.append(warning);
        row.dataset.blocked="true";
      }
      if(song.dbSong===null && hasCustomReleaseDate(song.display.releaseDate)){
        meta.append(textNode("small","Original display release date will stay \""+
          clean(song.display.releaseDate)+"\". Firestore stores tbd internally.",
          "bulk-genre-date-note"));
      }else if(song.dbSong===null && normalizeReleaseDate(song.display.releaseDate)!==clean(song.display.releaseDate||"tbd")){
        meta.append(textNode("small","Firestore stores lowercase tbd; existing JSON display text is unchanged.","bulk-genre-date-note"));
      }
      const label=document.createElement("label");
      const fieldId="bulk-genre-choice-"+index;
      label.htmlFor=fieldId;
      label.textContent="Choose genre";
      const select=document.createElement("select");
      select.id=fieldId;
      select.setAttribute("aria-label","Genre for "+song.title);
      select.add(new Option("Choose genre...",""));
      for(const name of genres)select.add(new Option(name,name));
      select.value=selection.get(song.id)||"";
      select.disabled=saving;
      select.addEventListener("change",()=>{
        if(select.value)selection.set(song.id,select.value);
        else selection.delete(song.id);
        row.dataset.selected=String(selection.has(song.id));
        updateControls();
      });
      const picker=document.createElement("div");
      picker.append(label,select);
      row.append(meta,picker);
      fragment.append(row);
    });
    list.append(fragment);
    updateControls();
  }
  async function reload({keepMessage=false}={}){
    if(loading)return loading;
    if(!keepMessage)message("Loading unassigned songs and current genres...");
    ready=false;
    loading=(async()=>{
      if(!(await verifyStaff())||!auth.currentUser)
        throw Error("Administrator permissions required.");
      const [names,albums,unassigned]=await Promise.all([
        readGenres(),readApprovedAlbums(),readUnassignedSongs()
      ]);
      genres=names;approvedAlbums=albums;candidates=unassigned;
      const allowed=new Set(genres);
      const validIds=new Set(candidates.map(song=>song.id));
      selection=new Map([...selection].filter(([id,g])=>validIds.has(id)&&allowed.has(g)));
      ready=true;
      render();
      if(!keepMessage){
        const blocked=candidates.filter(song=>createIssues(song,approvedAlbums).length).length;
        message(candidates.length
          ?"Select genres and click Save All. "+
            (blocked?blocked+" JSON-only songs need metadata corrections; their individual reasons appear in the list."
              :"All listed songs are ready for genre assignment.")
          :"Every song already has a genre.");
      }
    })();
    updateControls();
    try{
      await loading;
      return true;
    }catch(error){
      ready=false;
      list.replaceChildren(textNode("p","Could not load unassigned songs.","bulk-genre-empty"));
      count.textContent="Genre list unavailable";
      message("Cannot load bulk genre editor: "+error.message,true);
      return false;
    }finally{
      loading=null;
      updateControls();
    }
  }
  function open(){
    if(!ready&&!loading)void reload();
    else if(ready)render();
  }
  tab?.addEventListener("click",open);
  if(location.hash==="#admin-genres-bulk")open();

  search.addEventListener("input",()=>{if(ready)render();});
  refresh.addEventListener("click",()=>{
    if(selection.size&&!confirm("Refresh the list? Your unsaved genre selections will be kept only for songs that are still unassigned."))return;
    void reload();
  });
  clear.addEventListener("click",()=>{
    selection.clear();render();message("Selections cleared. No songs were changed.");
  });
  window.addEventListener("princesstg:genres-updated",()=>{
    if(!ready||saving||loading)return;
    void (async()=>{
      try{
        genres=await readGenres();
        const allowed=new Set(genres);
        selection=new Map([...selection].filter(([,g])=>allowed.has(g)));
        render();
      }catch(error){message("Could not update genre options: "+error.message,true);}
    })();
  });

  save.addEventListener("click",async()=>{
    if(saving||!selection.size||!ready)return;
    const jobs=candidates.filter(song=>selection.has(song.id))
      .map(song=>({song,genre:selection.get(song.id)}));
    if(!jobs.length)return;
    if(!window.confirm("Save "+jobs.length+" genre assignment(s)?\n\n"+
      "Only songs without a genre will be changed. Existing genres cannot be overwritten."))return;

    saving=true;render();message("Checking permissions and current genre list...");
    const results={saved:0,skipped:0,failed:0};
    const errors=[];
    try{
      if(!(await verifyStaff())||!auth.currentUser)
        throw Error("Administrator permissions required.");
      const user=auth.currentUser;
      const [latestGenres,latestAlbums]=await Promise.all([readGenres(),readApprovedAlbums()]);
      const currentGenres=new Set(latestGenres);
      const invalid=jobs.filter(job=>!currentGenres.has(job.genre));
      if(invalid.length)throw Error("Some genre options changed. Refresh genres before saving.");
      approvedAlbums=latestAlbums;
      const eligible=[],blocked=[];
      for(const job of jobs){
        const issues=createIssues(job.song,latestAlbums);
        if(issues.length)blocked.push({job,issues});
        else eligible.push(job);
      }
      // Never send obviously invalid new documents just to obtain 23
      // indistinguishable permission-denied errors. Keep their selections
      // for after the owner corrects their JSON metadata / album mapping.
      let cursor=0,completed=0;
      async function worker(){
        while(cursor<eligible.length){
          const {song,genre}=eligible[cursor++];
          try{
            const result=await assignMissingGenre(song,genre,user);
            if(result==="saved")results.saved++;
            else results.skipped++;
            selection.delete(song.id);
          }catch(error){
            results.failed++;
            errors.push(song.title+": "+(error?.message||"save failed"));
          }
          completed++;
          if(completed%5===0||completed===eligible.length)
            message("Saving genres: "+completed+"/"+eligible.length+" eligible records processed...");
        }
      }
      await Promise.all(Array.from({length:Math.min(MAX_PARALLEL_SAVES,eligible.length)},worker));
      const summary=results.saved+" saved, "+results.skipped+
        " skipped because they already had a genre, "+blocked.length+
        " blocked by missing/invalid JSON metadata, "+results.failed+" Firestore write failures.";
      // Locally remove confirmed writes even if the refresh request fails.
      const successful=new Set(jobs.filter(job=>!selection.has(job.song.id)).map(job=>job.song.id));
      candidates=candidates.filter(song=>!successful.has(song.id));
      render();
      const reloaded=await reload({keepMessage:true});
      const blockedDetails=blocked.slice(0,8).map(({job,issues})=>
        job.song.title+": "+issues.join("; ")).join("\n");
      message(summary+
        (reloaded?"":"\nThe list could not refresh. Use Refresh List to retry.")+
        (blockedDetails?"\nNot sent to Firestore:\n"+blockedDetails+
          (blocked.length>8?"\nAnd "+(blocked.length-8)+" more; see song rows for reasons.":""):"")+
        (errors.length?"\nFirestore denied these:\n"+errors.slice(0,5).join("\n")+
          (errors.length>5?"\nAnd "+(errors.length-5)+" more errors.":""):""),
        results.failed>0||blocked.length>0||!reloaded);
    }catch(error){
      message("Could not complete bulk save: "+error.message,true);
    }finally{
      saving=false;
      render();
    }
  });
});
