// Pure local-date and health statistics helpers. No Firebase and no network access.
export function localDay(date=new Date()){
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),
    String(date.getDate()).padStart(2,"0")].join("-");
}
export function parseDay(key){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(key)))return null;
  const [y,m,d]=key.split("-").map(Number);
  const date=new Date(y,m-1,d);
  return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d?date:null;
}
export function shiftDay(key,delta){
  const date=parseDay(key);
  if(!date)return null;
  date.setDate(date.getDate()+delta);
  return localDay(date);
}
export function mondayOf(key){
  const date=parseDay(key);
  if(!date)return null;
  date.setDate(date.getDate()-(date.getDay()+6)%7);
  return localDay(date);
}
export function monthOf(key){return String(key||"").slice(0,7);}
export function caloriesOn(day){
  return (Array.isArray(day?.foods)?day.foods:[]).reduce((sum,food)=>
    sum+Math.max(0,Number(food.calories)||0),0);
}
export function workoutMinutes(day){
  return (Array.isArray(day?.workouts)?day.workouts:[]).reduce((sum,entry)=>
    sum+Math.max(0,Number(entry.minutes)||0),0);
}
export function average(numbers){
  return numbers.length?numbers.reduce((a,b)=>a+b,0)/numbers.length:null;
}
export function periodStats(days,predicate){
  const selected=days.filter(day=>predicate(day.date));
  const calories=selected.filter(day=>Array.isArray(day.foods)&&day.foods.length);
  const weights=selected.filter(day=>Number(day.weightLb)>0);
  const workouts=selected.flatMap(day=>Array.isArray(day.workouts)?day.workouts:[]);
  return {
    calorieAverage:average(calories.map(caloriesOn)),
    calorieTotal:calories.reduce((a,day)=>a+caloriesOn(day),0),
    loggedDays:calories.length,
    weightAverage:average(weights.map(day=>Number(day.weightLb))),
    weightDays:weights.length,
    workoutCount:workouts.length,
    workoutMinutes:workouts.reduce((a,w)=>a+Number(w.minutes||0),0)
  };
}
export function lastDays(days,end,count){
  const start=shiftDay(end,1-count);
  return days.filter(day=>day.date>=start&&day.date<=end);
}
export function weeklyStats(days,today=localDay()){
  const start=mondayOf(today);
  const end=shiftDay(start,6);
  return periodStats(days,key=>key>=start&&key<=end);
}
export function monthlyStats(days,today=localDay()){
  const month=monthOf(today);
  return periodStats(days,key=>monthOf(key)===month);
}
export function recentWeeks(days,today=localDay(),count=8){
  const start=mondayOf(today);
  return Array.from({length:count},(_,i)=>{
    const weekStart=shiftDay(start,-7*(count-1-i));
    const weekEnd=shiftDay(weekStart,6);
    const stats=periodStats(days,key=>key>=weekStart&&key<=weekEnd);
    return {label:weekStart.slice(5),start:weekStart,end:weekEnd,...stats};
  });
}
export function recentMonths(days,today=localDay(),count=6){
  const date=parseDay(today);
  return Array.from({length:count},(_,i)=>{
    const n=count-1-i;
    const point=new Date(date.getFullYear(),date.getMonth()-n,1);
    const key=localDay(point).slice(0,7);
    const stats=periodStats(days,dayKey=>monthOf(dayKey)===key);
    return {label:key,start:key+"-01",...stats};
  });
}
export function pounds(value){
  return Number.isFinite(Number(value))&&Number(value)>0?
    Number(value).toLocaleString(undefined,{maximumFractionDigits:1})+" lb":"Not logged";
}
export function calories(value){
  return Number.isFinite(Number(value))?
    Math.round(Number(value)).toLocaleString()+" kcal":"Not logged";
}
