// Isolated nested navigation: does not change the outer Games / RPG tab state.
const tabs=[...document.querySelectorAll("#rpg-admin-tabs [data-rpg-admin-tab]")];
function activate(tab,focus=false){
  for(const button of tabs){
    const selected=button===tab;
    button.setAttribute("aria-selected",String(selected));
    button.tabIndex=selected?0:-1;
    document.getElementById(button.getAttribute("aria-controls")).hidden=!selected;
  }
  if(focus)tab.focus();
}
for(const [index,tab] of tabs.entries()){
  tab.addEventListener("click",()=>activate(tab));
  tab.addEventListener("keydown",event=>{
    let next=index;
    if(event.key==="ArrowRight")next=(index+1)%tabs.length;
    else if(event.key==="ArrowLeft")next=(index-1+tabs.length)%tabs.length;
    else if(event.key==="Home")next=0;
    else if(event.key==="End")next=tabs.length-1;
    else return;
    event.preventDefault();activate(tabs[next],true);
  });
}
if(tabs.length)activate(tabs[0]);
