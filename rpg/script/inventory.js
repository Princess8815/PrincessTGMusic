// The hotbar is row 1 of the same inventory, not a separate container.
export const HOTBAR_SLOTS=10;
export const EXTRA_ROWS=2;
export const SLOT_COUNT=HOTBAR_SLOTS*(1+EXTRA_ROWS);
export const STARTING_SLOTS=HOTBAR_SLOTS;
export class Inventory {
  constructor(element,label,items,onSelect) {
    this.element=element;this.label=label;this.items=items;this.onSelect=onSelect;
    this.slots=Array(SLOT_COUNT).fill(null);
    this.unlockedSlots=STARTING_SLOTS;this.selected=0;this.inspected=0;
    this.dialog=document.getElementById("inventory-dialog");
    this.grid=document.getElementById("inventory-grid");
    this.capacityLabel=document.getElementById("inventory-capacity");
    this.detail=document.getElementById("inventory-detail");
    this.render();
  }
  isUnlocked(index) {
    return Number.isInteger(index)&&index>=0&&index<this.unlockedSlots;
  }
  // Reserved for future progression. Each expansion unlocks a full row.
  unlockNextRow() {
    if(this.unlockedSlots>=SLOT_COUNT)return false;
    this.unlockedSlots=Math.min(SLOT_COUNT,this.unlockedSlots+HOTBAR_SLOTS);
    this.render();return true;
  }
  // Only unlocked slots contribute to capacity; insertion remains all-or-nothing.
  add(id,quantity=1) {
    if(!this.items[id]||this.items[id].category==="Tool"||!Number.isInteger(quantity)||quantity<=0)return false;
    const capacity=this.slots.slice(0,this.unlockedSlots).reduce((n,s)=>n+(!s?99:s.id===id?99-s.quantity:0),0);
    if(capacity<quantity)return false;
    let remaining=quantity;
    for(let i=0;i<this.unlockedSlots&&remaining>0;i++){
      const slot=this.slots[i];
      if(slot?.id!==id)continue;
      const take=Math.min(99-slot.quantity,remaining);
      slot.quantity+=take;remaining-=take;
    }
    for(let i=0;i<this.unlockedSlots&&remaining>0;i++){
      if(this.slots[i])continue;
      const take=Math.min(99,remaining);
      this.slots[i]={id,quantity:take};remaining-=take;
    }
    this.render();return true;
  }
  select(index) {
    if(!this.isUnlocked(index)||index>=HOTBAR_SLOTS)return false;
    this.selected=index;this.inspected=index;this.render();this.onSelect?.();return true;
  }
  describe(index) {
    if(!this.isUnlocked(index))return "Locked";
    const slot=this.slots[index];
    return slot?this.items[slot.id].name+" ×"+slot.quantity:"Empty";
  }
  inspect(index) {
    if(!this.isUnlocked(index))return;
    if(index<HOTBAR_SLOTS){this.select(index);return;}
    this.inspected=index;this.render();
  }
  open() {
    this.inspected=this.selected;
    this.render();
    if(!this.dialog.open)this.dialog.showModal();
  }
  makeSlot(index,expanded=false) {
    const slot=this.slots[index],locked=!this.isUnlocked(index);
    const button=document.createElement("button");
    button.type="button";button.className="inventory-slot";
    button.classList.toggle("locked",locked);
    const active=!locked&&index===(expanded?this.inspected:this.selected);
    button.classList.toggle("selected",active);
    button.setAttribute("aria-pressed",String(active));
    const number=document.createElement("span");number.className="slot-number";
    number.textContent=expanded?String(index+1):String((index+1)%10);
    button.append(number);
    if(locked){
      const lock=document.createElement("span");lock.className="inventory-lock";lock.setAttribute("aria-hidden","true");
      button.append(lock);button.disabled=true;
    }else if(slot){
      const icon=document.createElement("span");icon.className="slot-icon";icon.textContent=this.items[slot.id].icon;icon.setAttribute("aria-hidden","true");
      const count=document.createElement("span");count.className="slot-count";count.textContent=slot.quantity;
      button.append(icon,count);
    }
    const description=this.describe(index);
    button.title=description;button.setAttribute("aria-label","Slot "+(index+1)+": "+description);
    button.addEventListener("click",()=>expanded?this.inspect(index):this.select(index));
    return button;
  }
  render(){
    this.element.replaceChildren(...Array.from({length:HOTBAR_SLOTS},(_,i)=>this.makeSlot(i)));
    this.label.textContent=this.describe(this.selected)==="Empty"?"Empty slot":this.describe(this.selected);
    this.grid.replaceChildren(...Array.from({length:SLOT_COUNT},(_,i)=>this.makeSlot(i,true)));
    this.capacityLabel.textContent=this.unlockedSlots+" / "+SLOT_COUNT+" slots unlocked";
    this.detail.textContent="Slot "+(this.inspected+1)+": "+this.describe(this.inspected);
  }
}
