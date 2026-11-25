import {ERROR_LIST} from "./site-errors.js";
const search=document.getElementById("error-search"),list=document.getElementById("error-list");
function render(){
 const query=search.value.trim().toLowerCase();
 const visible=ERROR_LIST.filter(item=>[item.code,item.message,item.help].some(value=>value.toLowerCase().includes(query)));
 list.replaceChildren(...visible.map(item=>{
  const row=document.createElement("tr");row.id=item.code;
  for(const value of [item.code,item.message,item.help]){
   const cell=document.createElement("td");cell.textContent=value;row.append(cell);
  }
  return row;
 }));
 document.getElementById("error-count").textContent=visible.length+(visible.length===1?" code":" codes");
 document.getElementById("error-empty").hidden=visible.length>0;
}
search.value=new URLSearchParams(location.search).get("code")||"";
search.addEventListener("input",render);render();
