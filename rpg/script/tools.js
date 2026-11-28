// Permanent equipment, independent of inventory. IDs identify specific upgrade tiers.
export const TOOL_ORDER=["rusty_sword","rusty_hatchet","rusty_pickaxe","rusty_hoe","rusty_watering_can"];
export class ToolSlot {
  constructor(items,onEquip,onCycle) {
    this.items=items;
    this.order=TOOL_ORDER.filter(id=>items[id]?.category==="Tool");
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
  get currentId(){return this.order[this.index];}
  get current(){return this.items[this.currentId];}
  cycle(){this.index=(this.index+1)%this.order.length;this.render();this.onCycle?.();}
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
