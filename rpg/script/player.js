import { centerOf,canOccupy,terrainAt } from "./world.js";
import { createStats } from "./stats.js";
export const MOVE_KEYS = new Set(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"]);
export function createPlayer(world) {
  return {...centerOf(world,world.spawn), radius:11, speed:170, facing:"down", moving:false, walkTime:0, stats:createStats()};
}
export function movePlayer(player,world,keys,dt) {
  const has=(a,b)=>keys.has(a)||keys.has(b);
  let dx=Number(has("d","arrowright"))-Number(has("a","arrowleft"));
  let dy=Number(has("s","arrowdown"))-Number(has("w","arrowup"));
  player.moving=false;
  if (!dx&&!dy) return;
  if (Math.abs(dx)>Math.abs(dy)) player.facing=dx>0?"right":"left";
  else player.facing=dy>0?"down":"up";
  const length=Math.hypot(dx,dy);
  const distance=player.speed*terrainAt(world,player.x,player.y).speed*Math.min(dt,.05);
  dx=dx/length*distance; dy=dy/length*distance;
  const oldX=player.x,oldY=player.y;
  // Resolve each axis independently so the character slides along obstacles.
  if (canOccupy(world,player.x+dx,player.y,player.radius)) player.x+=dx;
  if (canOccupy(world,player.x,player.y+dy,player.radius)) player.y+=dy;
  player.moving=player.x!==oldX||player.y!==oldY;
  if (player.moving) player.walkTime+=dt;
}
