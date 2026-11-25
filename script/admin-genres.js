import {publicError,withErrorCode} from "./site-errors.js";
import {auth, db} from "./firebase.js";
import {verifyStaff} from "./staff-auth.js";
import {loadAllSongs} from "./song-data.js";
import {
  doc, getDoc, getDocs, collection, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const $ = id => document.getElementById(id);
const clean = x => String(x||"").trim().replace(/\s+/g," ");
const norm = x => clean(x).toLowerCase();
const genresRef = doc(db,"enums","genres");
let genres = [];
function status(id,message,isError=false) {
  const e = $(id); e.textContent=isError?withErrorCode(message,"PTG-901"):message;
  e.style.color = isError ? "#fca5a5" : "#86efac";
}
async function requireAdmin() {
  if (!(await verifyStaff()) || !auth.currentUser) throw Error("Administrator permissions required.");
}
async function refresh() {
  const snapshot = await getDoc(genresRef);
  const stored = snapshot.exists() ? snapshot.data().values : null;
  const fallback = window.PrincessTGGenres || [];
  if (stored !== null && !Array.isArray(stored)) throw Error("Invalid enums/genres.values.");
  genres = (stored || fallback).filter(x => typeof x === "string" && clean(x)).map(clean);
  window.PrincessTGGenres = [...genres];
  window.populatePrincessTGGenres?.();
  window.dispatchEvent(new CustomEvent("princesstg:genres-updated", {detail:[...genres]}));
  for(const id of ["edit-genre-select","delete-genre-select"]) {
    const el=$(id), chosen=el.value;
    el.replaceChildren(new Option("Choose a genre...",""));
    for(const g of genres) el.add(new Option(g,g));
    if(genres.includes(chosen)) el.value=chosen;
  }
}
function matches(song,original) {
  const source=[song.genre,song.genres,song.primaryGenre,song.secondaryGenre,song.thirdGenre];
  return source.some(value => (Array.isArray(value)?value:[value]).some(x=>norm(x)===norm(original)));
}
async function editGenre(oldName,newName,remove=false) {
  await requireAdmin();
  if(!genres.some(g=>norm(g)===norm(oldName))) throw Error("Genre no longer exists.");
  if(!remove && genres.some(g=>norm(g)===norm(newName) && norm(g)!==norm(oldName))) throw Error("Genre name already exists.");
  const songs=(await loadAllSongs("../audioPlayer/audio/song-details.json")).filter(s=>matches(s,oldName));
  if(remove && songs.length) throw Error("Reassign "+songs.length+" song(s) before deleting this genre.");
  if(songs.length>380) throw Error("More than 380 songs match. A staged migration is required.");
  const current=await getDoc(genresRef);
  const values=current.exists()?current.data().values:(window.PrincessTGGenres||[]);
  if(!Array.isArray(values)) throw Error("Invalid genre values.");
  const batch=writeBatch(db);
  batch.set(genresRef,{values:remove?values.filter(g=>norm(g)!==norm(oldName)):values.map(g=>norm(g)===norm(oldName)?newName:g)},{merge:true});
  if(!remove) {
    const saved=await getDocs(collection(db,"songs"));
    const ids=new Set(saved.docs.map(d=>d.id));
    const me=auth.currentUser;
    for(const song of songs) {
      const id=song.pageId||clean(song.title).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
      const ref=doc(db,"songs",id);
      const changes={genre:newName,updatedAt:serverTimestamp()};
      if(ids.has(id)) {
        // Keep any multi-genre fields synchronized.
        const extra={};
        for(const field of ["genres","primaryGenre","secondaryGenre","thirdGenre"]) {
          if(song[field] === undefined) continue;
          extra[field]=Array.isArray(song[field])
            ? song[field].map(x=>norm(x)===norm(oldName)?newName:x)
            : (norm(song[field])===norm(oldName)?newName:song[field]);
        }
        batch.update(ref,{...changes,...extra});
      } else {
        batch.set(ref,{
          title:song.title||id, description:String(song.description||""),
          album:String(song.album||""),
          releaseDate:String(song.releaseDate||"tbd"),
          lyrics:String(song.lyrics||""),
          translation:String(song.translation||""),
          lyricsCollapsed:song.lyricsCollapsed!==false,
          translationCollapsed:song.translationCollapsed!==false,
          ...changes,pageId:id,
          submittedBy:{uid:me.uid,username:"PrincessTG"},
          createdAt:serverTimestamp()
        });
      }
    }
  }
  await batch.commit();
  await refresh();
  return songs.length;
}
document.addEventListener("DOMContentLoaded",async()=>{
  try{await requireAdmin();await refresh();}
  catch(e){status("add-genre-status","Genre management unavailable: "+publicError(e,"PTG-901"),true);return;}
  $("add-genre-form").addEventListener("submit",async event=>{
    event.preventDefault();
    try{
      await requireAdmin();
      const name=clean($("new-genre-name").value);
      if(!name||name.length>100)throw Error("Genre name must be 1–100 characters.");
      if(genres.some(g=>norm(g)===norm(name)))throw Error("Genre already exists.");
      const current=await getDoc(genresRef);
      const values=current.exists()?current.data().values:genres;
      if(!Array.isArray(values))throw Error("Invalid genre list.");
      const batch=writeBatch(db);
      batch.set(genresRef,{values:[...values,name]},{merge:true});
      await batch.commit();
      $("add-genre-form").reset();
      await refresh();
      status("add-genre-status","Genre added.");
    }catch(e){status("add-genre-status",publicError(e,"PTG-901"),true);}
  });
  $("edit-genre-select").addEventListener("change",()=>{
    $("edit-genre-name").value=$("edit-genre-select").value;
  });
  $("edit-genre-form").addEventListener("submit",async event=>{
    event.preventDefault();
    try{
      const oldName=$("edit-genre-select").value,newName=clean($("edit-genre-name").value);
      if(!oldName)throw Error("Choose a genre.");
      if(!newName||newName.length>100)throw Error("Enter a new genre name.");
      const count=await editGenre(oldName,newName);
      $("edit-genre-select").value=newName;
      status("edit-genre-status","Genre saved. Updated "+count+" song(s).");
    }catch(e){status("edit-genre-status",publicError(e,"PTG-901"),true);}
  });
  $("delete-genre-button").addEventListener("click",async()=>{
    try{
      const name=$("delete-genre-select").value;
      if(!name)throw Error("Choose a genre.");
      if($("delete-genre-confirm").value!=="DELETE")throw Error("Type DELETE to confirm.");
      await editGenre(name,"",true);
      $("delete-genre-select").value="";
      $("delete-genre-confirm").value="";
      status("delete-genre-status","Genre deleted.");
    }catch(e){status("delete-genre-status",publicError(e,"PTG-901"),true);}
  });
});
