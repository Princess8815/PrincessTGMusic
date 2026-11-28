// The loadout is the single source of truth for worn gear and the five tool slots.
export const TOOL_TYPES=["sword","hatchet","pickaxe","hoe","watering_can"];
export const ARMOR_SLOTS=[
  ["head","Head"],["chest","Chest"],["legs","Legs"],["boots","Boots"],
  ["gloves","Gloves"],["offhand","Offhand"],["ammo","Ammo"]
];
export const TOOL_SLOTS=[
  ["sword","Sword"],["hatchet","Hatchet"],["pickaxe","Pickaxe"],["hoe","Hoe"],["watering_can","Watering Can"]
];
export class Equipment {
  constructor(items){
    this.items=items;
    this.slots=Object.fromEntries([...ARMOR_SLOTS,...TOOL_SLOTS].map(([id])=>[id,null]));
    for(const type of TOOL_TYPES){
      const id="rusty_"+type;
      if(items[id]?.toolType===type)this.slots[type]={id,quantity:1};
    }
  }
  get(slot){return Object.hasOwn(this.slots,slot)?this.slots[slot]:null;}
  item(slot){const entry=this.get(slot);return entry?this.items[entry.id]:null;}
  accepts(slot,id,quantity=1){
    if(!Object.hasOwn(this.slots,slot)||!Object.hasOwn(this.items,id)||!Number.isInteger(quantity)||quantity<1)return false;
    const item=this.items[id];
    if(TOOL_TYPES.includes(slot))return item.category==="Tool"&&item.toolType===slot&&quantity===1;
    return item.equipmentSlot===slot&&quantity<=(slot==="ammo"?(item.maxStack??99):1);
  }
}
export class EquipmentHUD {
  constructor(equipment,tools){
    this.equipment=equipment;this.tools=tools;
    this.armor=document.getElementById("armor-grid");this.toolGrid=document.getElementById("tools-grid");
    this.detail=document.getElementById("equipment-detail");
    this.render();
  }
  makeSlot(type,label,isTool){
    const item=this.equipment.item(type),entry=this.equipment.get(type);
    const button=document.createElement("button");button.type="button";button.className="gear-slot";
    const active=isTool&&this.tools.currentType===type;
    button.classList.toggle("gear-active",active);button.classList.toggle("gear-empty",!item);
    button.setAttribute("aria-pressed",String(active));
    button.setAttribute("aria-label",label+": "+(item?item.name:"Empty")+(active?", active tool":""));
    const image=document.createElement("span");image.className="gear-icon";
    if(item?.iconAsset){
      const icon=document.createElement("img");icon.alt="";icon.src=new URL("../"+item.iconAsset,import.meta.url).href;
      icon.addEventListener("error",()=>{image.textContent=item.icon||"—";});
      image.append(icon);
    }else{
      image.textContent=item?.icon||"—";image.setAttribute("aria-hidden","true");
    }
    const title=document.createElement("span");title.className="gear-label";title.textContent=label;
    const name=document.createElement("span");name.className="gear-name";name.textContent=item?item.name+(type==="ammo"?" ×"+entry.quantity:""):"Empty";
    button.append(image,title,name);
    if(active){const mark=document.createElement("span");mark.className="gear-current";mark.textContent="Active";button.append(mark);}
    button.addEventListener("click",()=>{
      if(isTool&&item){this.tools.selectType(type);return;}
      this.detail.textContent=label+": "+(item?item.name:"Empty equipment slot");
    });
    return button;
  }
  render(){
    this.armor.replaceChildren(...ARMOR_SLOTS.map(([type,label])=>this.makeSlot(type,label,false)));
    this.toolGrid.replaceChildren(...TOOL_SLOTS.map(([type,label])=>this.makeSlot(type,label,true)));
    this.detail.textContent="Active tool: "+(this.tools.current?.name||"None");
  }
}
