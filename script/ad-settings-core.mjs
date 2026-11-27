import {BANNER_PATHS,PRODUCTION_ORIGIN,bannerPlacement} from "./banner-ads-core.mjs";
export const DEFAULT_AD_SETTINGS=Object.freeze({testBanners:true,realAdsRequested:false,interstitialsRequested:false,rewardedRequested:false,levelsBetween:5,minutesBetween:10,disabledPaths:Object.freeze([])});
export const configId=origin=>origin===PRODUCTION_ORIGIN?"live":"preview";
export const normalizeAdPath=path=>{
 const p=path.replace(/^\/PrincessTGMusic(?=\/|$)/i,"").replace(/\/index(?:\.html)?$/i,"/").replace(/\.html$/i,"").replace(/\/$/,"")||"/";
 return BANNER_PATHS.find(x=>x.toLowerCase()===p.toLowerCase())||null;
};
export function validateAdSettings(input){
 if(!input||typeof input!=="object")throw Error("Missing advertisement settings.");
 const out={};
 for(const key of ["testBanners","realAdsRequested","interstitialsRequested","rewardedRequested"]){if(typeof input[key]!=="boolean")throw Error("Invalid "+key);out[key]=input[key];}
 for(const [key,min,max] of [["levelsBetween",5,100],["minutesBetween",10,1440]]){
  if(!Number.isInteger(input[key])||input[key]<min||input[key]>max)throw Error(key+" must be a whole number between "+min+" and "+max+".");out[key]=input[key];
 }
 if(!Array.isArray(input.disabledPaths)||new Set(input.disabledPaths).size!==input.disabledPaths.length||input.disabledPaths.some(p=>!BANNER_PATHS.includes(p)))throw Error("Invalid disabled page list.");
 out.disabledPaths=[...input.disabledPaths];return out;
}
export function mockEnabled(settings,path){
 const key=normalizeAdPath(path);return !!settings?.testBanners&&!!key&&!settings.disabledPaths.includes(key);
}
// Phase 2 planning only. No provider call or reward is authorized by any setting.
export const LIVE_ADS_IMPLEMENTED=false;
export const actualAdsAllowed=()=>false;
export function gameBreakEligible({settings,completedLevels,startedAt,lastShownAt=null,now=Date.now(),membership,atNaturalBreak}){
 if(!settings?.realAdsRequested||!settings.interstitialsRequested||membership!=="free"||!atNaturalBreak)return false;
 const anchor=lastShownAt??startedAt;
 return Number.isFinite(anchor)&&Number.isFinite(now)&&now>=anchor&&Number.isInteger(completedLevels)&&completedLevels>=settings.levelsBetween&&now-anchor>=settings.minutesBetween*60000;
}
