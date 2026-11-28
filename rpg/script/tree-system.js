// Per-tree remaining hardness is independent of the shared type definitions.
export const HARDNESS_MAX=100000;
export function validHardness(n){return Number.isInteger(n)&&n>=1&&n<=HARDNESS_MAX;}
export function applyHardnessOverrides(defaults,overrides={}){
  return Object.fromEntries(Object.entries(defaults).map(([id,t])=>[id,{...t,hardness:validHardness(overrides[id]?.hardness)?overrides[id].hardness:t.hardness}]));
}
export function initializeTrees(world,types){
  world.treeTypes=types;
  world.treeByTile=Object.fromEntries(Object.entries(types).map(([id,t])=>[t.tile,{...t,id}]));
  world.trees=new Map();
  for(let y=0;y<world.height;y++)for(let x=0;x<world.width;x++){
    const def=world.treeByTile[world.tiles[y][x]];
    if(!def)continue;
    // Map perimeter and inter-region forest walls remain protected.
    const boundary=x===0||x===world.width-1||world.regions.some(r=>y===r.startY||y===r.endY-1);
    world.trees.set(x+","+y,{x,y,type:def.id,name:def.name,remaining:def.hardness,maxHardness:def.hardness,dropItem:def.dropItem,xp:def.woodcuttingXp,protected:boundary});
  }
  return world;
}
export function targetTree(world,player){
  const direction={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[player.facing];
  if(!direction)return null;
  const t=world.tileSize,tx=Math.floor((player.x+direction[0]*(player.radius+12))/t),ty=Math.floor((player.y+direction[1]*(player.radius+12))/t);
  const tree=world.trees.get(tx+","+ty);
  return tree||null;
}
export function chopTree(world,player,tree){
  if(!tree||world.trees.get(tree.x+","+tree.y)!==tree)return {ok:false,reason:"No tree in reach."};
  if(tree.protected)return {ok:false,reason:"Boundary trees cannot be cut."};
  const tool=player.tool;
  if(tool?.toolType!=="hatchet"||!Number.isInteger(tool.strength)||tool.strength<1)return {ok:false,reason:"Equip a hatchet first."};
  player.stats.stamina-=1;
  if(player.stats.stamina<=0)player.stats.stamina=10;
  tree.remaining=Math.max(0,tree.remaining-tool.strength);
  if(tree.remaining>0)return {ok:true,felled:false,remaining:tree.remaining,max:tree.maxHardness};
  const row=world.tiles[tree.y];
  world.tiles[tree.y]=row.slice(0,tree.x)+"G"+row.slice(tree.x+1);
  world.trees.delete(tree.x+","+tree.y);
  world.objects.push({id:"tree-drop-"+tree.x+"-"+tree.y,type:"pickup",item:tree.dropItem,quantity:1,x:tree.x,y:tree.y,collected:false});
  return {ok:true,felled:true,item:tree.dropItem,xp:tree.xp};
}
