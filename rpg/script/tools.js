// The hotbar tool is a view of the equipment loadout, never a duplicate item.
import { TOOL_TYPES } from "./equipment.js";
export class ToolSlot {
  constructor(equipment,onEquip,onCycle){
    this.equipment=equipment;this.order=TOOL_TYPES.filter(type=>equipment.item(type));
    if(!this.order.length)throw Error("No starter tools configured");
    this.index=0;
    this.button=document.getElementById("tool-slot");
    this.icon=document.getElementById("tool-icon");
    this.fallback=document.getElementById("tool-fallback");
    this.label=document.getElementById("equipped-tool");
    this.onEquip=onEquip;this.onCycle=onCycle;
    this.button.addEventListener("click",()=>this.cycle());
    this.icon.addEventListener("error",()=>{this.icon.hidden=true;this.fallback.hidden=false;});
    this.render();
  }
  get currentType(){return this.order[this.index];}
  get currentId(){return this.equipment.get(this.currentType)?.id;}
  get current(){return this.equipment.item(this.currentType);}
  selectType(type){
    const index=this.order.indexOf(type);
    if(index<0||!this.equipment.item(type))return false;
    this.index=index;this.render();this.onCycle?.();return true;
  }
  cycle(){return this.selectType(this.order[(this.index+1)%this.order.length]);}
  render(){
    const tool=this.current;
    this.fallback.textContent=tool.icon||"—";
    this.icon.hidden=!tool.iconAsset;this.fallback.hidden=Boolean(tool.iconAsset);
    if(tool.iconAsset)this.icon.src=new URL("../"+tool.iconAsset,import.meta.url).href;
    this.label.textContent="Equipped tool: "+tool.name;
    this.button.title=tool.name+" · T to switch";
    this.button.setAttribute("aria-label","Equipped "+tool.name+". Switch tool (T)");
    this.onEquip?.(tool);
  }
}
