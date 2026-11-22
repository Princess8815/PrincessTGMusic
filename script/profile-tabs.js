// Profile tabs stay independent of Firebase loading and are keyboard accessible.
const tabs=[...document.querySelectorAll("[data-profile-tab]")];
const panels=[...document.querySelectorAll("[data-profile-panel]")];
const ids=new Set(tabs.map(tab=>tab.dataset.profileTab));
function activate(id, updateHash=false) {
  if(!ids.has(id))id="account";
  for(const tab of tabs){
    const selected=tab.dataset.profileTab===id;
    tab.setAttribute("aria-selected",String(selected));
    tab.tabIndex=selected?0:-1;
  }
  for(const panel of panels)panel.hidden=panel.dataset.profilePanel!==id;
  if(id==="delete"){
    // The final deletion still requires DELETE, the password and the
    // existing confirmation dialog. Only expand the form if permitted.
    const confirmation=document.getElementById("close-details");
    if(confirmation && !confirmation.hidden)confirmation.open=true;
  }
  if(updateHash)history.replaceState(null,"","#tab-"+id);
}
tabs.forEach((tab,index)=>{
  tab.addEventListener("click",()=>activate(tab.dataset.profileTab,true));
  tab.addEventListener("keydown",event=>{
    let next=index;
    if(event.key==="ArrowRight")next=(index+1)%tabs.length;
    else if(event.key==="ArrowLeft")next=(index-1+tabs.length)%tabs.length;
    else if(event.key==="Home")next=0;
    else if(event.key==="End")next=tabs.length-1;
    else return;
    event.preventDefault();
    tabs[next].focus();
    activate(tabs[next].dataset.profileTab,true);
  });
});
window.addEventListener("hashchange",()=>activate(location.hash.replace(/^#tab-/,"")));
activate(location.hash.replace(/^#tab-/,""));
