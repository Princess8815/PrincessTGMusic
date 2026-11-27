import {validImage,validPrice} from "./starlight-model.mjs";
export const DRAGON_TYPE="dragons";
export const DRAGON_CATALOG=Object.freeze([
 ["fire-dragon","Fire Dragon",1000000],
 ["ice-dragon","Ice Dragon",1500000],
 ["water-dragon","Water Dragon",2000000],
 ["earth-dragon","Earth Dragon",2500000],
 ["wind-dragon","Wind Dragon",3500000],
 ["spirit-dragon","Spirit Dragon",5000000]
].map(Object.freeze));
export const isElementalDragon=item=>item?.typeId===DRAGON_TYPE&&DRAGON_CATALOG.some(([id])=>id===item.id);
export const dragonPerksLabel="Perks planned · Not active yet";
export function validateDragonImport(data){
 if(data?.version!==1||data.type?.id!==DRAGON_TYPE||data.type?.name!=="Dragons"||!Array.isArray(data.items)||data.items.length!==DRAGON_CATALOG.length)throw Error("Choose the six-dragon catalog import file.");
 const ids=new Set(data.items.map(i=>i?.id));if(ids.size!==DRAGON_CATALOG.length)throw Error("Duplicate dragon IDs.");
 return DRAGON_CATALOG.map(([id,name,price])=>{
  const i=data.items.find(x=>x?.id===id);
  if(!i||i.name!==name||i.typeId!==DRAGON_TYPE||i.price!==price||!validPrice(i.price)||i.active!==true||!validImage(i.image)||!i.image.startsWith("data:image/webp;base64,"))throw Error("Invalid catalog entry: "+name);
  return {id,name,price,typeId:DRAGON_TYPE,image:i.image,active:true};
 });
}
