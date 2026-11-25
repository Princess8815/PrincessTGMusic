// Shared album membership and release-date logic, independent of Firebase.
export const albumKey=value=>String(value??"").trim().toLowerCase();
export function songAlbums(song){
  const values=Array.isArray(song?.albums)&&song.albums.length?song.albums:
    (Array.isArray(song?.album)?song.album:typeof song?.album==="string"?song.album.split(/[,;|]/):[]);
  const seen=new Set();
  return values.filter(x=>typeof x==="string").map(x=>x.trim()).filter(x=>{
    const key=albumKey(x);if(!key||seen.has(key))return false;seen.add(key);return true;
  });
}
export function validReleaseDate(value){
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return "";
  const date=new Date(value+"T00:00:00Z");
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:"";
}
export function earliestRelease(...dates){return dates.map(validReleaseDate).filter(Boolean).sort()[0]||"tbd";}
export function originalRelease(song){return validReleaseDate(song?.originalReleaseDate)||(song?.originalReleaseDate==="tbd"?"tbd":validReleaseDate(song?.releaseDate)||"tbd");}
export function releaseForAlbums(names,original,records){
  return earliestRelease(original,...names.filter(name=>!/^singles?$/i.test(name.trim())).map(name=>records.get(albumKey(name))?.releaseDate));
}
export function validatedAlbums(values,allowed){
  const names=values.filter(Boolean);
  if(!values[0]||names.length>3)throw Error("Select a primary album and up to two optional albums.");
  if(names.some(name=>!allowed.includes(name)))throw Error("Select approved albums from the database.");
  if(new Set(names.map(albumKey)).size!==names.length)throw Error("Choose a different album in each field.");
  return names;
}
export function albumRecordMap(snapshot){return new Map(snapshot.docs.map(doc=>[albumKey(doc.data().name),doc.data()]));}
export function fillAlbumSelectors(selects,allowed,selected=[]){
  if(selected.length>3)throw Error("This song has more than three existing album memberships. Resolve them before editing.");
  selects.forEach((select,i)=>{
    select.replaceChildren(new Option(i===0?"Select primary album":"None (optional)",""));
    for(const name of allowed)select.add(new Option(name,name));
    const current=selected[i];
    if(current){
      const exact=allowed.find(name=>albumKey(name)===albumKey(current));
      if(!exact)select.add(new Option(current+" (not in album list)",current));
      select.value=exact||current;
    }
    select.disabled=false;
  });
}
export const membershipFields=names=>({album:names[0],albums:names});
export function renamedMembership(song,oldName,newName){
  return [...new Map(songAlbums(song).map(name=>albumKey(name)===albumKey(oldName)?newName:name).map(name=>[albumKey(name),name])).values()];
}
