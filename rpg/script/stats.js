// Player vitals. Keep combat and farming rules separate from display.
export const STARTING_HEALTH=10;
export const STARTING_STAMINA=10;

export function createStats(){
  return {health:STARTING_HEALTH,maxHealth:STARTING_HEALTH,stamina:STARTING_STAMINA,maxStamina:STARTING_STAMINA};
}
function validAmount(amount){return Number.isFinite(amount)&&amount>=0;}
export function damage(stats,amount){
  if(!validAmount(amount))return false;
  stats.health=Math.max(0,stats.health-amount);
  return true;
}
export function heal(stats,amount){
  if(!validAmount(amount))return false;
  stats.health=Math.min(stats.maxHealth,stats.health+amount);
  return true;
}
export function spendStamina(stats,amount){
  if(!validAmount(amount)||stats.stamina<amount)return false;
  stats.stamina-=amount;
  return true;
}
export function restoreStamina(stats,amount){
  if(!validAmount(amount))return false;
  stats.stamina=Math.min(stats.maxStamina,stats.stamina+amount);
  return true;
}
export class VitalsHUD{
  constructor(){
    this.bars=["health","stamina"].map(key=>({
      key,maxKey:key==="health"?"maxHealth":"maxStamina",
      bar:document.getElementById(key+"-bar"),
      value:document.getElementById(key+"-value")
    }));
  }
  render(stats){
    for(const {key,maxKey,bar,value} of this.bars){
      const max=stats[maxKey],current=stats[key];
      if(bar.max!==max)bar.max=max;
      if(bar.value!==current)bar.value=current;
      const text=current+" / "+max;
      if(value.textContent!==text){value.textContent=text;bar.textContent=text;}
    }
  }
}
