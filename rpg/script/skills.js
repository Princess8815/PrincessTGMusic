// XP is cumulative. Each next-level cost grows by 10% from the level 1 base.
export const BASE_XP=100;
export const XP_GROWTH=1.1;
export const SKILLS=[
  {
    "id": "attack",
    "name": "Attack",
    "icon": "⚔",
    "startLevel": 1
  },
  {
    "id": "strength",
    "name": "Strength",
    "icon": "💪",
    "startLevel": 1
  },
  {
    "id": "defense",
    "name": "Defense",
    "icon": "🛡",
    "startLevel": 1
  },
  {
    "id": "health",
    "name": "Health",
    "icon": "♥",
    "startLevel": 10
  },
  {
    "id": "woodcutting",
    "name": "Woodcutting",
    "icon": "🪓",
    "startLevel": 1
  },
  {
    "id": "mining",
    "name": "Mining",
    "icon": "⛏",
    "startLevel": 1
  },
  {
    "id": "smithing",
    "name": "Smithing",
    "icon": "⚒",
    "startLevel": 1
  },
  {
    "id": "crafting",
    "name": "Crafting",
    "icon": "🧵",
    "startLevel": 1
  }
];
export function defaultSkillSettings(){
  return Object.fromEntries(SKILLS.map(s=>[s.id,{startLevel:s.startLevel,baseXp:BASE_XP,growthPercent:10}]));
}
export function validSkillSettings(s){
  return Number.isInteger(s?.startLevel)&&s.startLevel>=1&&s.startLevel<=30
    &&Number.isInteger(s.baseXp)&&s.baseXp>=1&&s.baseXp<=100000
    &&Number.isInteger(s.growthPercent)&&s.growthPercent>=1&&s.growthPercent<=100;
}
export function mergeSkillSettings(overrides={}){
  const defaults=defaultSkillSettings();
  for(const id of Object.keys(defaults))if(validSkillSettings(overrides[id])){
    const {startLevel,baseXp,growthPercent}=overrides[id];
    defaults[id]={startLevel,baseXp,growthPercent};
  }
  return defaults;
}
const DEFAULT_CURVE={baseXp:BASE_XP,growthPercent:10};
export function xpCost(level,curve=DEFAULT_CURVE){
  if(!Number.isSafeInteger(level)||level<1)return Infinity;
  const cost=Math.ceil(curve.baseXp*(1+curve.growthPercent/100)**(level-1)-1e-9);
  return Number.isSafeInteger(cost)?cost:Infinity;
}
export function xpForLevel(level,curve=DEFAULT_CURVE){
  if(!Number.isSafeInteger(level)||level<1)return Infinity;
  let total=0;
  for(let l=1;l<level;l++){
    total+=xpCost(l,curve);
    if(!Number.isSafeInteger(total))return Infinity;
  }
  return total;
}
export function levelForXp(xp,curve=DEFAULT_CURVE){
  if(!Number.isSafeInteger(xp)||xp<0)return 1;
  let level=1,total=0;
  while(Number.isSafeInteger(total+xpCost(level,curve))&&xp>=total+xpCost(level,curve)){
    total+=xpCost(level,curve);level++;
  }
  return level;
}
export function createSkills(settings=defaultSkillSettings()){
  const config=mergeSkillSettings(settings);
  return Object.fromEntries(SKILLS.map(s=>{const curve=config[s.id];return [s.id,{xp:xpForLevel(curve.startLevel,curve),level:curve.startLevel,curve}];}));
}
export function skillProgress(skill){
  const curve=skill.curve??DEFAULT_CURVE;
  const level=levelForXp(skill.xp,curve),start=xpForLevel(level,curve),next=xpForLevel(level+1,curve);
  return {level,totalXp:skill.xp,nextLevelXp:next,remaining:next-skill.xp,progress:skill.xp-start,required:next-start};
}
export function awardXp(skills,id,amount){
  if(!Object.hasOwn(skills,id)||!Number.isSafeInteger(amount)||amount<=0)return null;
  const skill=skills[id],before=skill.level;
  if(!Number.isSafeInteger(skill.xp+amount))return null;
  skill.xp+=amount;skill.level=levelForXp(skill.xp,skill.curve??DEFAULT_CURVE);
  return {id,amount,before,level:skill.level,leveledUp:skill.level>before};
}
const fmt=n=>Number.isFinite(n)?n.toLocaleString():"Maximum";
export class SkillsHUD{
  constructor(skills){
    this.skills=skills;this.grid=document.getElementById("skills-grid");
    this.detail=document.getElementById("skill-detail");
    this.total=document.getElementById("skill-total-level");
    this.selected="health";this.render();
  }
  showDetail(id){
    this.selected=id;
    const def=SKILLS.find(s=>s.id===id),p=skillProgress(this.skills[id]);
    this.detail.textContent=def.name+" · Level "+p.level+" · Total XP: "+fmt(p.totalXp)+" · XP to next level: "+fmt(p.remaining);
  }
  render(){
    this.total.textContent="Total level: "+SKILLS.reduce((n,s)=>n+this.skills[s.id].level,0);
    this.grid.replaceChildren(...SKILLS.map(def=>{
      const p=skillProgress(this.skills[def.id]),button=document.createElement("button");
      button.type="button";button.className="skill-panel";
      const icon=document.createElement("span");icon.className="skill-icon";icon.textContent=def.icon;icon.setAttribute("aria-hidden","true");
      const title=document.createElement("span");title.className="skill-name";title.textContent=def.name;
      const level=document.createElement("span");level.className="skill-level";level.textContent="Lv. "+p.level;
      const progress=document.createElement("progress");progress.className="skill-progress";progress.max=Number.isFinite(p.required)?p.required:1;progress.value=Number.isFinite(p.required)?p.progress:0;progress.setAttribute("aria-label",def.name+" level progress");
      const tip=document.createElement("span");tip.className="skill-tooltip";tip.textContent="Total XP: "+fmt(p.totalXp)+" · XP to next level: "+fmt(p.remaining);
      button.title=tip.textContent;button.setAttribute("aria-label",def.name+", level "+p.level+", "+tip.textContent);
      button.append(icon,title,level,progress,tip);
      for(const event of ["mouseenter","focus","click"])button.addEventListener(event,()=>this.showDetail(def.id));
      return button;
    }));
    this.showDetail(this.selected);
  }
}
