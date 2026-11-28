// Admin catalogue: use the site's existing Firebase staff permission guard.
import { verifyStaff,watchStaffRole } from "../../script/staff-auth.js";
const $=id=>document.getElementById(id);
const content=$("rpg-items-content"),status=$("rpg-items-status"),rows=$("rpg-item-rows");
const search=$("rpg-item-search"),category=$("rpg-item-category"),filter=$("rpg-item-status-filter");
let items=[],allowed=false,generation=0;
function clear(message) {
  allowed=false;generation++;items=[];rows.replaceChildren();content.hidden=true;status.textContent=message;
}
function options(select,values) {
  const previous=select.value;
  const first=document.createElement("option");first.value="";first.textContent=select===category?"All categories":"All statuses";
  const list=[...new Set(values)].sort().map(value=>{const option=document.createElement("option");option.value=value;option.textContent=value;return option;});
  select.replaceChildren(first,...list);select.value=values.includes(previous)?previous:"";
}
function render() {
  if(!allowed)return;
  const query=search.value.trim().toLowerCase();
  const visible=items.filter(item=>(!category.value||item.category===category.value)&&(!filter.value||item.status===filter.value)&&[item.id,item.name,item.category,item.source,item.status].join(" ").toLowerCase().includes(query));
  rows.replaceChildren(...visible.map(item=>{
    const tr=document.createElement("tr");
    for(const value of [item.name,item.id,item.category,item.source,item.status]){
      const cell=document.createElement("td");
      if(tr.children.length===0){
        if(item.iconAsset){const image=document.createElement("img");image.className="rpg-item-icon";image.alt="";image.src=new URL("../"+item.iconAsset,import.meta.url).href;cell.append(image);}
        else cell.append(item.icon+" ");
        cell.append(value);
      }else cell.textContent=value;
      tr.append(cell);
    }
    return tr;
  }));
  $("rpg-item-count").textContent=visible.length+" of "+items.length+" items";
}
async function load() {
  const run=++generation;
  allowed=false;content.hidden=true;rows.replaceChildren();items=[];status.textContent="Verifying staff access…";
  try {
    if(!await verifyStaff()){if(run===generation)clear("Administrator access required.");return;}
    if(run!==generation)return;
    status.textContent="Loading item catalogue…";
    const response=await fetch(new URL("../json/items.json",import.meta.url),{cache:"no-store"});
    if(!response.ok)throw Error("Item catalogue unavailable");
    const data=await response.json();
    if(run!==generation)return;
    items=Object.entries(data).map(([id,item])=>({id,name:item.name||id,icon:item.icon||"",iconAsset:item.iconAsset||"",category:item.category||"Uncategorized",source:item.source||"Not specified",status:item.status||"Not specified"})).sort((a,b)=>a.name.localeCompare(b.name));
    options(category,items.map(item=>item.category));options(filter,items.map(item=>item.status));
    allowed=true;content.hidden=false;status.textContent="";render();
  }catch(error){if(run===generation)clear("Unable to load item catalogue. Reopen the tab to retry.");console.error(error);}
}
watchStaffRole(role=>{
  if(role!==true){clear(role===null?"Verifying staff access…":"Administrator access required.");return;}
  if(!allowed)void load();
});
$("admin-main-tab-rpg").addEventListener("click",()=>{if(!allowed)void load();});
$("rpg-item-refresh").addEventListener("click",load);
search.addEventListener("input",render);category.addEventListener("change",render);filter.addEventListener("change",render);
