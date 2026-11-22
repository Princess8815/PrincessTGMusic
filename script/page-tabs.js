// Progressive enhancement: preserves all original Home and About content.
// Without JavaScript every section remains visible.
function createTabs(main, configuration, prefix){
  const tabs=document.createElement("div");
  tabs.className="ptg-tab-nav";tabs.setAttribute("role","tablist");
  tabs.setAttribute("aria-label",configuration.label);
  const panels=[];
  for(const [id,label,nodes] of configuration.tabs){
    const panel=document.createElement("div");
    panel.className="ptg-tab-panel";
    panel.id=prefix+"-panel-"+id;
    panel.setAttribute("role","tabpanel");
    panel.setAttribute("aria-labelledby",prefix+"-tab-"+id);
    const button=document.createElement("button");
    button.type="button";button.id=prefix+"-tab-"+id;
    button.setAttribute("role","tab");
    button.setAttribute("aria-controls",panel.id);
    button.textContent=label;
    button.addEventListener("click",()=>activate(id,true));
    tabs.append(button);
    for(const node of nodes)if(node)panel.append(node);
    panels.push({id,button,panel});
  }
  const first=configuration.position;
  main.insertBefore(tabs,first);
  let next=tabs;
  for(const {panel} of panels){next.after(panel);next=panel;}
  function activate(id,hash=false){
    const current=panels.some(p=>p.id===id)?id:panels[0].id;
    for(const item of panels){
      const selected=item.id===current;
      item.panel.hidden=!selected;
      item.button.setAttribute("aria-selected",String(selected));
      item.button.tabIndex=selected?0:-1;
    }
    if(hash){
      history.replaceState(null,"","#"+prefix+"-"+current);
    }
  }
  tabs.addEventListener("keydown",event=>{
    if(!["ArrowRight","ArrowLeft","Home","End"].includes(event.key))return;
    event.preventDefault();
    const idx=panels.findIndex(p=>p.button.getAttribute("aria-selected")==="true");
    const target=event.key==="Home"?0:event.key==="End"?panels.length-1:
      (idx+(event.key==="ArrowRight"?1:-1)+panels.length)%panels.length;
    activate(panels[target].id,true);
    panels[target].button.focus();
  });
  const wanted=location.hash.replace("#"+prefix+"-","");
  activate(wanted);
  window.addEventListener("hashchange",()=>{
    const next=location.hash.replace("#"+prefix+"-","");
    if(panels.some(p=>p.id===next))activate(next);
  });
}
function initHome(){
  const main=document.querySelector("body > main");
  if(!main||!document.getElementById("streaming-links"))return false;
  const platform=main.querySelector("section[aria-labelledby='streaming-links']");
  const albums=main.querySelector("section.albums");
  const more=[...main.querySelectorAll(":scope > section.more-content")];
  if(!platform||!albums)return false;
  const intro=document.createElement("div");
  intro.className="ptg-page-intro";
  const h1=document.createElement("h1");h1.textContent="Explore PrincessTG Music";
  const paragraph=document.createElement("p");
  paragraph.textContent="Listen to the music, discover albums, or explore more creative work.";
  intro.append(h1,paragraph);
  main.insertBefore(intro,platform);
  createTabs(main,{
    label:"Homepage sections",position:platform,
    tabs:[
      ["listen","Listen",[platform]],
      ["albums","Albums",[albums]],
      ["discover","Discover",more]
    ]
  },"home");
  return true;
}
function initAbout(){
  const main=document.querySelector("main.about-page");
  if(!main||!document.getElementById("about-heading"))return false;
  const get=id=>main.querySelector('section[aria-labelledby="'+id+'"]');
  const bio=get("bio-heading"),city=get("location-heading"),interests=get("interests-heading"),
    music=get("music-heading"),message=get("message-heading"),
    creative=get("creative-heading"),future=get("future-heading");
  if(!bio||!music||!message)return false;
  createTabs(main,{
    label:"About PrincessTG sections",position:bio,
    tabs:[
      ["story","My Story",[bio,city]],
      ["interests","Interests",[interests]],
      ["music","My Music",[music]],
      ["message","My Message",[message]],
      ["creative","Creative Work",[creative]],
      ["future","What's Ahead",[future]]
    ]
  },"about");
  return true;
}
function start(){
  if(document.querySelector(".ptg-tab-nav"))return;
  initHome()||initAbout();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
else start();
