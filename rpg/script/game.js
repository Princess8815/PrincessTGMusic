import { loadWorld,terrainAt,nearestObject,regionAt } from "./world.js";
import { createPlayer,movePlayer,MOVE_KEYS } from "./player.js";
import { WorldRenderer } from "./renderer.js";
import { Inventory } from "./inventory.js";
import { ToolSlot } from "./tools.js";
import { VitalsHUD } from "./stats.js";

export class VillageGame {
  constructor(audio) {
    this.audio=audio;
    this.screen=document.getElementById("game-screen");
    this.canvas=document.getElementById("world-canvas");
    this.renderer=new WorldRenderer(this.canvas);
    this.keys=new Set();this.active=false;this.world=null;this.frame=null;this.loadPromise=null;
    this.prompt=document.getElementById("interaction-prompt");
    this.message=document.getElementById("game-message");
    this.loading=document.getElementById("game-loading");
    this.loadingMessage=document.getElementById("game-loading-message");
    this.retry=document.getElementById("retry-game");
    this.terrain=document.getElementById("terrain-label");
    this.location=document.getElementById("map-name");
    this.vitals=new VitalsHUD();
    this.inventoryDialog=document.getElementById("inventory-dialog");
    document.getElementById("open-inventory").addEventListener("click",()=>this.toggleInventory());
    document.getElementById("close-inventory").addEventListener("click",()=>this.inventoryDialog.close());
    this.inventoryDialog.addEventListener("close",()=>{this.clearKeys();if(this.active)this.canvas.focus();});
    window.addEventListener("keydown",event=>this.keyDown(event));
    window.addEventListener("keyup",event=>this.keys.delete(event.key.toLowerCase()));
    window.addEventListener("blur",()=>this.clearKeys());
    document.addEventListener("visibilitychange",()=>this.clearKeys());
  }
  clearKeys() { this.keys.clear(); }
  async enter() {
    if(this.active&&this.world) return;
    this.active=true;
    document.querySelector(".home").hidden=true;
    document.querySelector(".village").hidden=true;
    this.screen.hidden=false;document.body.classList.add("in-game");
    this.clearKeys();this.loading.hidden=false;this.retry.hidden=true;this.loadingMessage.textContent="Loading village…";
    try {
      if(!this.world) {
        this.loadPromise??=loadWorld();
        const world=await this.loadPromise;
        if(!this.world) {
          this.world=world;this.player=createPlayer(world);
          this.inventory=new Inventory(document.getElementById("inventory-bar"),document.getElementById("selected-item"),world.items,()=>{
            this.audio.playEffect("select");if(!this.inventoryDialog.open)this.canvas.focus();
          });
          this.tools=new ToolSlot(world.items,tool=>{
            this.player.tool=tool;
          },()=>{
            this.audio.playEffect("select");this.canvas.focus();
          });
          document.getElementById("map-name").textContent=world.name;
        }
      }
      if(!this.active) return;
      this.vitals.render(this.player.stats);
      this.loading.hidden=true;this.canvas.focus();
      this.notify("Follow the north path to your house and farm.");
      this.lastTime=performance.now();
      if(this.frame===null) this.frame=requestAnimationFrame(time=>this.tick(time));
    } catch(error) {
      this.loadPromise=null;
      console.error("Could not load RPG map",error);
      if(this.active) {this.loadingMessage.textContent="Could not load village. Try again.";this.retry.hidden=false;}
    }
  }
  leave() {
    this.active=false;this.clearKeys();
    if(this.inventoryDialog.open)this.inventoryDialog.close();
    if(this.frame!==null) cancelAnimationFrame(this.frame);
    this.frame=null;this.screen.hidden=true;document.body.classList.remove("in-game");
    document.querySelector(".home").hidden=false;document.querySelector(".village").hidden=false;
    document.getElementById("play-button").focus();
  }
  paused() { return document.hidden||Boolean(document.querySelector("dialog[open]")); }
  toggleInventory(){
    if(!this.active||!this.inventory||document.querySelector("dialog[open]:not(#inventory-dialog)"))return;
    this.clearKeys();
    if(this.inventoryDialog.open)this.inventoryDialog.close();
    else this.inventory.open();
    this.audio.playEffect("select");
  }
  keyDown(event) {
    if(!this.active||!this.world||document.hidden||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.key.toLowerCase()==="i"&&!document.querySelector("dialog[open]:not(#inventory-dialog)")){
      event.preventDefault();if(!event.repeat)this.toggleInventory();return;
    }
    if(this.paused())return;
    if(event.target instanceof HTMLElement&&["INPUT","SELECT","TEXTAREA"].includes(event.target.tagName)) return;
    const key=event.key.toLowerCase();
    if(MOVE_KEYS.has(key)){event.preventDefault();this.keys.add(key);return;}
    if(key==="t"){event.preventDefault();if(!event.repeat)this.tools.cycle();return;}
    if(key==="e"){event.preventDefault();if(!event.repeat)this.interact();return;}
    if(/^[0-9]$/.test(key)){event.preventDefault();if(!event.repeat)this.inventory.select((Number(key)+9)%10);return;}
    if(key==="escape"){event.preventDefault();this.leave();}
  }
  notify(text) { this.message.textContent=text;this.messageUntil=performance.now()+3500; }
  interact() {
    const object=nearestObject(this.world,this.player);
    if(!object){this.notify("Move closer to an object to interact.");return;}
    if(object.type==="sign"||object.type==="npc"){
      this.notify(object.text);this.audio.playEffect("interact");return;
    }
    if(this.inventory.add(object.item,object.quantity)){
      object.collected=true;
      this.notify("Collected "+this.world.items[object.item].name+" ×"+object.quantity);
      this.audio.playEffect("pickup");
    }else this.notify("Your inventory is full.");
  }
  tick(now) {
    this.frame=null;
    if(!this.active||!this.world) return;
    const dt=Math.min(.05,Math.max(0,(now-this.lastTime)/1000));this.lastTime=now;
    if(!this.paused())movePlayer(this.player,this.world,this.keys,dt);
    else {this.clearKeys();this.player.moving=false;}
    this.renderer.draw(this.world,this.player,now/1000);
    this.vitals.render(this.player.stats);
    const region=regionAt(this.world,this.player.y);
    if(this.location.textContent!==region)this.location.textContent=region;
    const terrain=terrainAt(this.world,this.player.x,this.player.y).name;
    if(this.terrain.textContent!==terrain)this.terrain.textContent=terrain;
    const object=nearestObject(this.world,this.player);
    this.prompt.hidden=!object;
    if(object)this.prompt.textContent="E · "+(object.type==="sign"?"Read sign":object.type==="npc"?"Talk":object.type==="chest"?"Open chest":"Collect "+this.world.items[object.item].name);
    if(now>this.messageUntil)this.message.textContent="";
    this.frame=requestAnimationFrame(time=>this.tick(time));
  }
}
