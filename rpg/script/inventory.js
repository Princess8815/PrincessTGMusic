export const SLOT_COUNT=10;
export class Inventory {
  constructor(element,label,items,onSelect) {
    this.element=element; this.label=label; this.items=items; this.onSelect=onSelect;
    this.slots=Array(SLOT_COUNT).fill(null); this.selected=0;
    this.render();
  }
  // All-or-nothing insertion: no item disappears if there is insufficient room.
  add(id,quantity=1) {
    if (!this.items[id]||this.items[id].category==="Tool"||!Number.isInteger(quantity)||quantity<=0) return false;
    const capacity=this.slots.reduce((n,s)=>n+(!s?99:s.id===id?99-s.quantity:0),0);
    if (capacity<quantity) return false;
    let remaining=quantity;
    for (const slot of this.slots) {
      if (slot?.id!==id) continue;
      const take=Math.min(99-slot.quantity,remaining);
      slot.quantity+=take; remaining-=take;
    }
    for (let i=0;i<SLOT_COUNT&&remaining>0;i++) {
      if (this.slots[i]) continue;
      const take=Math.min(99,remaining);
      this.slots[i]={id,quantity:take}; remaining-=take;
    }
    this.render(); return true;
  }
  select(index) {
    if (!Number.isInteger(index)||index<0||index>=SLOT_COUNT) return;
    this.selected=index; this.render(); this.onSelect?.();
  }
  render() {
    const buttons=this.slots.map((slot,index)=>{
      const button=document.createElement("button");
      button.type="button"; button.className="inventory-slot";
      button.classList.toggle("selected",index===this.selected);
      button.setAttribute("aria-pressed",String(index===this.selected));
      const number=document.createElement("span"); number.className="slot-number"; number.textContent=String((index+1)%10);
      button.append(number);
      if (slot) {
        const icon=document.createElement("span"); icon.className="slot-icon"; icon.textContent=this.items[slot.id].icon; icon.setAttribute("aria-hidden","true");
        const count=document.createElement("span"); count.className="slot-count"; count.textContent=slot.quantity;
        button.append(icon,count);
      }
      const description=slot?this.items[slot.id].name+" ×"+slot.quantity:"Empty";
      button.title=description; button.setAttribute("aria-label","Slot "+((index+1)%10)+": "+description);
      button.addEventListener("click",()=>this.select(index));
      return button;
    });
    this.element.replaceChildren(...buttons);
    const selected=this.slots[this.selected];
    this.label.textContent=selected?this.items[selected.id].name+" ×"+selected.quantity:"Empty slot";
  }
}
