// Profile health analytics are computed locally from this user's own Firestore days.
// "Untracked" is never counted as zero; an explicitly logged 0 kcal is valid.
import {
  localDay,parseDay,shiftDay,mondayOf,monthOf,periodStats,
  hasCompleteFoodLog,untrackedFoodCount,caloriesOn,workoutMinutes
} from "./health-math.js";

const keyDate=value=>typeof value==="string"&&parseDay(value)!==null;
const validWeight=day=>typeof day?.weightLb==="number"
  &&Number.isFinite(day.weightLb)&&day.weightLb>0;
const formatDate=day=>day.slice(0,10);
const order=(a,b)=>a.date.localeCompare(b.date);

export function validHistoryDays(days,today=localDay()){
  return days.filter(day=>keyDate(day?.date)&&day.date<=today)
    .sort(order);
}
function periodMeta(days,start,end,key){
  const selected=days.filter(day=>day.date>=start&&day.date<=end);
  const tracked=selected.filter(hasCompleteFoodLog);
  const weightEntries=selected.filter(validWeight);
  const stats=periodStats(selected,()=>true);
  const partial=selected.filter(day=>Array.isArray(day.foods)
    &&day.foods.length&&!hasCompleteFoodLog(day)).length;
  const untracked=selected.reduce((sum,day)=>sum+untrackedFoodCount(day),0);
  const weightChange=weightEntries.length<2?null:
    Math.round((weightEntries.at(-1).weightLb-weightEntries[0].weightLb)*10)/10;
  const mealCounts={Breakfast:0,Lunch:0,Dinner:0,Snack:0,Other:0};
  for(const day of selected)for(const food of Array.isArray(day.foods)?day.foods:[]){
    const meal=mealCounts[food.meal]!==undefined?food.meal:"Other";
    mealCounts[meal]++;
  }
  return {
    ...stats, key,start,end,
    days: selected.slice().reverse(),
    totalDaysLogged:selected.length,
    untrackedFoodItems:untracked,
    partialCalorieDays:partial,
    weightChange,
    firstWeight:weightEntries.length?weightEntries[0].weightLb:null,
    lastWeight:weightEntries.length?weightEntries.at(-1).weightLb:null,
    mealCounts,
    trackedDays:tracked.length
  };
}
export function buildPeriodHistory(days,today=localDay(),type="week"){
  if(!["week","month"].includes(type))throw Error("Unknown health period");
  const history=validHistoryDays(days,today);
  if(!history.length)return [];
  const first=history[0].date;
  const periods=[];
  if(type==="week"){
    let start=mondayOf(first),end=mondayOf(today);
    let guard=0;
    while(start<=end&&guard++<3000){
      const stop=shiftDay(start,6);
      periods.push(periodMeta(history,start,stop,start));
      start=shiftDay(start,7);
    }
  }else{
    let [year,month]=first.slice(0,7).split("-").map(Number);
    const last=monthOf(today),limit=1800;
    for(let guard=0;guard<limit;guard++){
      const key=String(year).padStart(4,"0")+"-"+String(month).padStart(2,"0");
      if(key>last)break;
      const start=key+"-01";
      const end=localDay(new Date(year,month,0));
      periods.push(periodMeta(history,start,end,key));
      month++;
      if(month===13){month=1;year++;}
    }
  }
  return periods.reverse();
}
export function healthAlerts(days,today=localDay()){
  const history=validHistoryDays(days,today);
  const recent=history.filter(day=>day.date>=shiftDay(today,-30));
  const twoWeeks=recent.filter(day=>day.date>=shiftDay(today,-13));
  const alerts=[];
  const partial=twoWeeks.filter(day=>Array.isArray(day.foods)
    &&day.foods.length>0&&!hasCompleteFoodLog(day));
  const untracked=partial.reduce((sum,day)=>sum+untrackedFoodCount(day),0);
  if(untracked){
    alerts.push({
      id:"untracked",level:"info",title:"Some food calories are Untracked",
      description:untracked+" item"+(untracked===1?"":"s")+" across "+partial.length+
        " recent day"+(partial.length===1?"":"s")+" lack calorie amounts. "+
        "Those days are excluded from calorie averages; an entered 0 kcal still counts."
    });
  }
  // Only evaluate completed, earlier dates. Today's diary may be unfinished.
  const completed=twoWeeks.filter(day=>day.date<today&&hasCompleteFoodLog(day));
  const veryLow=completed.filter(day=>caloriesOn(day)<800);
  if(veryLow.length){
    alerts.push({
      id:"very-low",level:"attention",title:"Very low logged calorie totals",
      description:veryLow.length+" completed day"+(veryLow.length===1?" has":"s have")+
        " fewer than 800 logged calories in the past 14 days. "+
        "The diary may be incomplete. If this reflects your actual intake, "+
        "very-low-calorie diets generally require clinical supervision.",
      source:"https://www.nice.org.uk/guidance/ng246/chapter/Physical-activity-and-diet"
    });
  }else{
    const low=completed.filter(day=>caloriesOn(day)>=800&&caloriesOn(day)<1200);
    if(low.length>=2){
      alerts.push({
        id:"low",level:"attention",title:"Several low logged calorie days",
        description:low.length+" completed days in the past 14 days have "+
          "800–1,199 logged calories. Confirm that entries are complete and "+
          "discuss a suitable intake with a qualified healthcare professional."
      });
    }
  }
  const weights=recent.filter(validWeight);
  if(weights.length>=2){
    const first=weights[0],last=weights.at(-1);
    const elapsed=(parseDay(last.date)-parseDay(first.date))/86400000;
    const change=last.weightLb-first.weightLb;
    const ratio=Math.abs(change)/first.weightLb;
    if(elapsed>=7&&ratio>=.05){
      alerts.push({
        id:"weight-change",level:"attention",title:"Notable change in recorded weight",
        description:"Morning weight changed "+Math.abs(change).toFixed(1)+
          " lb ("+(ratio*100).toFixed(1)+"%) between "+first.date+" and "+
          last.date+". Scale readings fluctuate. If this change is unexpected, "+
          "consider discussing it with a healthcare professional."
      });
    }
  }
  if(history.length===0){
    alerts.push({id:"start",level:"info",title:"No health entries yet",
      description:"Start logging meals, morning weights, or activity to see weekly and monthly patterns."});
  }else if(!alerts.length){
    alerts.push({id:"clear",level:"info",title:"No tracking alerts right now",
      description:"There are no data-quality flags or notable logged patterns "+
        "in the recent records. This does not determine your health status."});
  }
  return alerts;
}
