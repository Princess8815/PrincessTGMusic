import { centerOf } from "./world.js";
const COLORS={G:"#8fb875",P:"#d9bf8c",W:"#518fa5",B:"#b99463",T:"#80aa70",O:"#80aa70",H:"#a1bd80",R:"#8fb875",F:"#b2c792",L:"#8ab06e",S:"#8fb875"};
function noise(x,y,seed=0) { const n=Math.sin(x*127.1+y*311.7+seed*74.7)*43758.5453; return n-Math.floor(n); }
function ellipse(c,x,y,rx,ry,color) { c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill(); }
function line(c,x,y,x2,y2,color,width=2) { c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke(); }
function round(c,x,y,w,h,r,color) { c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill(); }

export class WorldRenderer {
  constructor(canvas) { this.canvas=canvas; this.ctx=canvas.getContext("2d"); this.toolImages=new Map(); this.treeImages=new Map(); }
  resize() {
    const rect=this.canvas.getBoundingClientRect();
    const dpr=Math.min(devicePixelRatio||1,2);
    const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
    if (this.canvas.width!==w||this.canvas.height!==h) {this.canvas.width=w;this.canvas.height=h;}
    this.width=rect.width;this.height=rect.height;this.dpr=dpr;
  }
  draw(world,player,time) {
    this.resize();
    const c=this.ctx,t=world.tileSize,w=this.width,h=this.height;
    const mapW=world.width*t,mapH=world.height*t;
    // Keep the player in view; center a map smaller than the viewport.
    const cameraX=mapW>w?Math.max(0,Math.min(mapW-w,player.x-w/2)):(mapW-w)/2;
    const cameraY=mapH>h?Math.max(0,Math.min(mapH-h,player.y-h/2)):(mapH-h)/2;
    c.setTransform(this.dpr,0,0,this.dpr,0,0);
    c.fillStyle="#355f55";c.fillRect(0,0,w,h);
    c.save();c.translate(-cameraX,-cameraY);
    const x0=Math.max(0,Math.floor(cameraX/t)-1),x1=Math.min(world.width-1,Math.ceil((cameraX+w)/t)+1);
    const y0=Math.max(0,Math.floor(cameraY/t)-1),y1=Math.min(world.height-1,Math.ceil((cameraY+h)/t)+1);
    const foreground=[];
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const tile=world.tiles[y][x]; this.drawGround(c,world,x,y,t,tile,time);
      const tree=world.treeByTile?.[tile];
      if(tree)foreground.push({y:(y+.8)*t,draw:()=>this.drawTree(c,tree,x*t,y*t,t,x,y)});
      else if (["H","R","S"].includes(tile)) foreground.push({y:(y+.8)*t,draw:()=>this.drawObstacle(c,x*t,y*t,t,tile,x,y)});
    }
    for(const building of world.buildings||[]) {
      foreground.push({y:(building.y+building.height)*t,draw:()=>this.drawFarmhouse(c,building,t)});
    }
    for(const object of world.objects) {
      if(object.collected) continue;
      const p=centerOf(world,object);
      foreground.push({y:p.y+10,draw:()=>this.drawObject(c,world,object,p,time)});
    }
    foreground.push({y:player.y+9,draw:()=>this.drawAxolotl(c,player.x,player.y,player.facing,player.moving?Math.sin(player.walkTime*15)*2:0,false,player.tool)});
    foreground.sort((a,b)=>a.y-b.y).forEach(entry=>entry.draw());
    c.restore();
  }
  drawTree(c,tree,x,y,t,tx,ty){
    let img=this.treeImages.get(tree.id);
    if(!img){img=new Image();img.src=new URL("../"+tree.iconAsset,import.meta.url).href;this.treeImages.set(tree.id,img);}
    if(img.complete&&img.naturalWidth)c.drawImage(img,x-t*.19,y-t*.48,t*1.38,t*1.48);
    else this.drawObstacle(c,x,y,t,tree.tile==="O"?"O":"T",tx,ty);
  }
  drawGround(c,world,x,y,t,tile,time) {
    const px=x*t,py=y*t;
    c.fillStyle=COLORS[tile]||COLORS.G;c.fillRect(px,py,t+.5,t+.5);
    if(tile==="W") {
      for(let i=0;i<3;i++){const ox=(noise(x,y,i)*25+time*8)%30;line(c,px+ox,py+9+i*13,px+ox+12,py+9+i*13,"#8cc3c8",1.4);}
      for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        const n=world.tiles[y+dy]?.[x+dx];
        if(n&&n!=="W"&&n!=="B"){c.fillStyle="#b6d0a1";c.fillRect(px+(dx>0?t-4:0),py+(dy>0?t-4:0),dx?4:t,dy?4:t);}
      }
    } else if(tile==="B") {
      for(let i=0;i<6;i++){c.fillStyle=i%2?"#cba478":"#b99463";c.fillRect(px+i*8,py,7,t);line(c,px+i*8,py+4,px+i*8,py+t-4,"#886744",1);}
      line(c,px,py+3,px+t,py+3,"#775e40",3);line(c,px,py+t-3,px+t,py+t-3,"#775e40",3);
    } else if(tile==="L") {
      for(let i=0;i<12;i++) {
        const a=px+4+noise(x,y,i+7)*40,b=py+9+noise(x,y,i+29)*35;
        line(c,a,b,a-4,b-9,"#4f8a50",2);line(c,a,b,a+4,b-12,"#5e9854",2);line(c,a,b,a+1,b-15,"#a8ce77",1.5);
      }
    } else if(tile==="P") {
      for(let i=0;i<5;i++){ellipse(c,px+noise(x,y,i+1)*t,py+noise(x,y,i+12)*t,1.6,1,"#c0a479");}
    } else {
      for(let i=0;i<5;i++){let a=px+4+noise(x,y,i+3)*40,b=py+4+noise(x,y,i+18)*40;line(c,a,b,a+2,b-4,"#719d65",1.3);}
      if(noise(x,y,42)>.85){ellipse(c,px+15,py+31,3,3,"#f7da88");ellipse(c,px+15,py+31,1.2,1.2,"#dc9a59");}
    }
  }
  drawObstacle(c,x,y,t,tile,tx,ty) {
    const mx=x+t/2,my=y+t/2;
    if(tile==="T"){
      ellipse(c,mx,my+15,23,12,"#456d514d");round(c,mx-5,my,10,22,3,"#84664a");
      ellipse(c,mx,my-6,24,25,"#376d55");ellipse(c,mx-8,my-12,15,17,"#4c9165");ellipse(c,mx+7,my-14,15,16,"#72a76a");ellipse(c,mx-3,my-18,11,10,"#92bc78");
    }else if(tile==="O"){
      // Oak: wider crown, thicker trunk, warmer leaf highlights.
      ellipse(c,mx,my+15,25,13,"#456d514d");
      round(c,mx-7,my-1,14,23,4,"#77543b");
      line(c,mx-3,my+7,mx-11,my-4,"#77543b",5);
      line(c,mx+4,my+5,mx+12,my-5,"#77543b",5);
      ellipse(c,mx,my-6,27,23,"#526f38");
      ellipse(c,mx-12,my-7,16,16,"#668a43");
      ellipse(c,mx+12,my-9,16,18,"#77994b");
      ellipse(c,mx-3,my-17,18,16,"#8da85a");
      ellipse(c,mx+7,my-23,9,7,"#a9ba68");
      for(let i=0;i<4;i++){
        const a=mx-14+noise(tx,ty,i+51)*28,b=my-14+noise(tx,ty,i+61)*17;
        ellipse(c,a,b,2.6,3.3,"#a88a4e");
      }
    }else if(tile==="S"){
      ellipse(c,mx,my+5,17,7,"#456d5140");
      line(c,mx-14,my+8,mx+11,my-9,"#694d35",5);
      line(c,mx-4,my+1,mx-12,my-8,"#805e3c",3);
      line(c,mx+2,my-3,mx+12,my+4,"#805e3c",3);
      line(c,mx-12,my+7,mx+10,my-8,"#bd9561",1.5);
      line(c,mx-8,my-13,mx+12,my-5,"#8b6641",4);
    }else if(tile==="R"){
      ellipse(c,mx,my+12,19,8,"#456d514d");ellipse(c,mx,my,17,14,"#647d7d");ellipse(c,mx-4,my-4,12,8,"#a0b1a5");line(c,mx-9,my+2,mx+3,my-2,"#778e87");
    }else{
      // Cottage footprint is a connected 3×2 tile block, drawn as one house.
      // Draw only its top-left anchor (map coordinates identify adjacent H tiles).
      // Each H tile has its own roof section so larger buildings remain data-driven.
      c.fillStyle="#e6c99c";c.fillRect(x+1,y+10,t-2,t-7);
      c.fillStyle="#9d6170";c.fillRect(x,y-5,t,t-6);
      for(let i=0;i<4;i++)line(c,x+2,y+i*10-2,x+t-2,y+i*10-2,"#bd7e84",2);
      if(tx%3===2){round(c,x+16,y+27,16,19,4,"#53746b");ellipse(c,x+27,y+39,2,2,"#f8d48e");}
      else {round(c,x+13,y+23,18,12,3,"#f5dc99");line(c,x+22,y+23,x+22,y+35,"#936b55");}
    }
  }
  drawFarmhouse(c,b,t) {
    const x=b.x*t,y=b.y*t,w=b.width*t,h=b.height*t;
    const mid=x+w/2,base=y+h;
    // A single building covers its full collision footprint; the doorway is decorative.
    ellipse(c,mid,base-4,w*.52,16,"#345b4e55");
    round(c,x+8,y+35,w-16,h-40,8,"#e8c8a0");
    c.fillStyle="#a47e55";c.fillRect(x+12,base-13,w-24,7);
    c.fillStyle="#7e5360";c.beginPath();c.moveTo(x-5,y+52);c.lineTo(x+20,y+3);c.lineTo(mid,y-24);c.lineTo(x+w-20,y+3);c.lineTo(x+w+5,y+52);c.closePath();c.fill();
    c.fillStyle="#b97278";c.beginPath();c.moveTo(x+4,y+42);c.lineTo(x+25,y+5);c.lineTo(mid,y-20);c.lineTo(x+w-25,y+5);c.lineTo(x+w-4,y+42);c.closePath();c.fill();
    for(let i=0;i<4;i++)line(c,x+20+i*5,y+12+i*9,x+w-20-i*5,y+12+i*9,"#995c68",2);
    round(c,x+w-61,y-10,22,37,3,"#a78067");round(c,x+w-65,y-14,30,9,3,"#775c54");
    for(const wx of [x+40,x+w-78]) {
      round(c,wx,y+70,38,31,4,"#896850");round(c,wx+4,y+74,30,23,3,"#f6e0a5");
      line(c,wx+19,y+74,wx+19,y+97,"#96734e");line(c,wx+4,y+85,wx+34,y+85,"#96734e");
      round(c,wx-3,y+101,44,7,3,"#99714b");
      for(let i=0;i<5;i++)ellipse(c,wx+4+i*8,y+101,4,4,i%2?"#ed9fa9":"#f2d384");
    }
    round(c,mid-21,base-54,42,49,7,"#496f66");
    round(c,mid-16,base-49,32,43,5,"#5a8674");
    ellipse(c,mid+11,base-24,3,3,"#f6d47c");
    round(c,mid-29,base-5,58,10,3,"#baa18a");
    // Door nameplate is visual only; no interaction is registered.
    round(c,mid-41,y+52,82,17,4,"#8c674e");c.font="bold 10px system-ui";c.textAlign="center";c.textBaseline="middle";c.fillStyle="#fff0cf";c.fillText(b.label,mid,y+60.5);
  }
  drawObject(c,world,o,p,time) {
    const {x,y}=p;
    ellipse(c,x,y+9,13,5,"#365b4d55");
    if(o.type==="npc"){this.drawAxolotl(c,x,y,"down",0,true);return;}
    if(o.type==="sign"){round(c,x-3,y-2,6,24,2,"#866548");round(c,x-15,y-16,30,19,3,"#d6ac72");line(c,x-9,y-10,x+9,y-10,"#795b47");line(c,x-9,y-5,x+5,y-5,"#795b47");return;}
    if(o.type==="chest"){round(c,x-16,y-12,32,24,4,"#946641");round(c,x-16,y-12,32,10,4,"#d9a866");round(c,x-3,y-4,6,10,2,"#f9da86");return;}
    const bob=Math.sin(time*3+o.x)*2;
    c.font="23px system-ui, sans-serif";c.textAlign="center";c.textBaseline="middle";c.fillText(world.items[o.item]?.icon||"?",x,y-4+bob);
    ellipse(c,x+13,y-15+bob,2,2,"#fff1ab");
  }
  drawAxolotl(c,x,y,facing,bob,npc,tool=null) {
    ellipse(c,x,y+10,17,7,"#324f4c55");
    c.save();c.translate(x,y+bob);
    c.rotate(({down:0,left:Math.PI/2,up:Math.PI,right:-Math.PI/2})[facing]||0);
    const skin=npc?"#9bd4b5":"#f3a7bd",gills=npc?"#529c96":"#d66a96";
    // Tail points behind the facing direction; eyes and gills rotate with the player.
    c.fillStyle=skin;c.beginPath();c.moveTo(-5,-6);c.quadraticCurveTo(-18,-26,3,-29);c.quadraticCurveTo(-4,-16,9,-7);c.fill();
    ellipse(c,0,-4,11,15,skin);
    for(const side of [-1,1]) {
      ellipse(c,side*10,-8,4,5,skin);ellipse(c,side*10,4,4,5,skin);
      for(let i=0;i<3;i++){c.save();c.translate(side*12,1+i*5);c.rotate(side*(.7-i*.3));ellipse(c,side*5,0,7,3,gills);c.restore();}
    }
    ellipse(c,0,6,15,12,skin);ellipse(c,0,10,10,6,npc?"#d8f0cc":"#ffdedb");
    ellipse(c,-6,7,2.3,3,"#25353b");ellipse(c,6,7,2.3,3,"#25353b");
    c.strokeStyle="#805168";c.lineWidth=1.3;c.beginPath();c.arc(0,10,3,0,Math.PI);c.stroke();
    if(tool?.iconAsset){
      let image=this.toolImages.get(tool.iconAsset);
      if(!image){image=new Image();image.src=new URL("../"+tool.iconAsset,import.meta.url).href;this.toolImages.set(tool.iconAsset,image);}
      if(image.complete&&image.naturalWidth)c.drawImage(image,12,-7,25,25);
    }
    c.restore();
  }
}
