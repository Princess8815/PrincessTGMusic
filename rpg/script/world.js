// World coordinates are pixels; JSON positions are tile indices.
export const TERRAIN = {
  G: { name:"Grass", solid:false, speed:1 },
  P: { name:"Path", solid:false, speed:1.08 },
  W: { name:"Deep water", solid:true, speed:0 },
  B: { name:"Wooden bridge", solid:false, speed:1 },
  T: { name:"Tree", solid:true, speed:0 },
  H: { name:"Cottage", solid:true, speed:0 },
  R: { name:"Rock", solid:true, speed:0 }
};
async function readJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Cannot load " + url);
  return response.json();
}
export async function loadWorld() {
  const [map,items] = await Promise.all([
    readJson(new URL("../json/maps/willowfin.json",import.meta.url)),
    readJson(new URL("../json/items.json",import.meta.url))
  ]);
  if (!map.tiles.every(row=>row.length===map.width) || map.tiles.length!==map.height) throw new Error("Invalid map dimensions");
  return { ...map, items, objects:map.objects.map(object=>({...object, collected:false})) };
}
export function tileAt(world,x,y) {
  return world.tiles[Math.floor(y/world.tileSize)]?.[Math.floor(x/world.tileSize)] ?? "W";
}
export function terrainAt(world,x,y) { return TERRAIN[tileAt(world,x,y)] ?? TERRAIN.W; }
export function centerOf(world,object) {
  return {x:(object.x+.5)*world.tileSize,y:(object.y+.5)*world.tileSize};
}
export function canOccupy(world,x,y,radius) {
  // Check all four corners of the small player collision box, not the decorative gills.
  for (const dx of [-radius,radius]) for (const dy of [-radius,radius]) {
    if (terrainAt(world,x+dx,y+dy).solid) return false;
  }
  for (const object of world.objects) {
    if (object.collected || !["sign","npc","chest"].includes(object.type)) continue;
    const p=centerOf(world,object);
    if (Math.abs(p.x-x)<radius+10 && Math.abs(p.y-y)<radius+10) return false;
  }
  return true;
}
export function nearestObject(world,player,range=64) {
  let nearest=null, distance=range;
  for (const object of world.objects) {
    if (object.collected) continue;
    const p=centerOf(world,object);
    const d=Math.hypot(p.x-player.x,p.y-player.y);
    if (d<distance) { nearest=object; distance=d; }
  }
  return nearest;
}
