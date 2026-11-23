import {auth,db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {collection,getDocsFromServer}
  from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {
  localDay,weeklyStats,monthlyStats,pounds,calories,
  hasCompleteFoodLog,caloriesOn,workoutMinutes,untrackedFoodCount,parseDay
} from "./health-math.js";
import {buildPeriodHistory,healthAlerts,validHistoryDays}
  from "./health-profile-analytics.js";

const $=id=>document.getElementById(id);
const SVG_NS="http://www.w3.org/2000/svg";
const REFRESH_MS=60000;
const button=$("profile-tab-health");
const refreshButton=$("profile-health-refresh");
const yearSelect=$("profile-health-year");
let currentUid=null;
let generation=0;
let lastLoaded=0;
let loading=null;
let history=[];
let weeks=[],months=[];

function node(tag,body,cls){
  const el=document.createElement(tag);
  if(body!==undefined)el.textContent=String(body);
  if(cls)el.className=cls;
  return el;
}
function svg(tag,attributes={},body){
  const el=document.createElementNS(SVG_NS,tag);
  for(const [key,value] of Object.entries(attributes))el.setAttribute(key,String(value));
  if(body!==undefined)el.textContent=String(body);
  return el;
}
function message(value,error=false){
  const el=$("profile-health-status");
  el.textContent=value;
  el.style.color=error?"#fecaca":"#cbd5e1";
}
function clearPanels(){
  const fields={
    "profile-health-weight":"Not logged",
    "profile-health-week":"Untracked",
    "profile-health-month":"Untracked",
    "profile-health-weight-week":"Not logged",
    "profile-health-weight-month":"Not logged",
    "profile-health-workout":"0 min",
    "profile-health-month-workout":"0 min",
    "profile-health-days":"0"
  };
  for(const [id,value] of Object.entries(fields))$(id).textContent=value;
  for(const id of [
    "profile-health-weight-date","profile-health-week-days","profile-health-month-days",
    "profile-health-weight-week-days","profile-health-weight-month-days",
    "profile-health-workout-count","profile-health-month-workout-count",
    "profile-health-date-range","profile-health-week-total","profile-health-month-total"
  ])$(id).textContent="";
  for(const id of [
    "profile-health-alerts","profile-health-weekly-breakdown",
    "profile-health-monthly-breakdown","profile-health-calorie-chart",
    "profile-health-weight-chart"
  ])$(id).replaceChildren();
  yearSelect.replaceChildren(new Option("All years","all"));
  history=[];weeks=[];months=[];
}
function currentWeekAndMonth(){
  const today=localDay();
  const week=weeklyStats(history,today),month=monthlyStats(history,today);
  const weightEntries=history.filter(day=>Number(day.weightLb)>0).slice()
    .sort((a,b)=>b.date.localeCompare(a.date));
  const latest=weightEntries[0];
  $("profile-health-weight").textContent=latest?pounds(latest.weightLb):"Not logged";
  $("profile-health-weight-date").textContent=latest?"Recorded "+latest.date:"No morning weight yet";
  $("profile-health-week").textContent=week.calorieAverage===null?"Untracked":calories(week.calorieAverage);
  $("profile-health-month").textContent=month.calorieAverage===null?"Untracked":calories(month.calorieAverage);
  $("profile-health-week-days").textContent=week.loggedDays+" fully tracked day(s)";
  $("profile-health-month-days").textContent=month.loggedDays+" fully tracked day(s)";
  $("profile-health-weight-week").textContent=
    week.weightAverage===null?"Not logged":pounds(week.weightAverage);
  $("profile-health-weight-month").textContent=
    month.weightAverage===null?"Not logged":pounds(month.weightAverage);
  $("profile-health-weight-week-days").textContent=week.weightDays+" morning weigh-in(s)";
  $("profile-health-weight-month-days").textContent=month.weightDays+" morning weigh-in(s)";
  $("profile-health-workout").textContent=week.workoutMinutes+" min";
  $("profile-health-month-workout").textContent=month.workoutMinutes+" min";
  $("profile-health-workout-count").textContent=week.workoutCount+" logged session(s)";
  $("profile-health-month-workout-count").textContent=month.workoutCount+" logged session(s)";
  $("profile-health-days").textContent=String(history.length);
  $("profile-health-date-range").textContent=history.length
    ?history[0].date+" to "+history.at(-1).date
    :"No diary dates saved";
}
function renderAlerts(){
  const container=$("profile-health-alerts");
  container.replaceChildren();
  for(const alert of healthAlerts(history,localDay())){
    const card=node("article",undefined,"profile-health-alert");
    card.dataset.level=alert.level;
    card.append(node("strong",alert.title),node("p",alert.description));
    if(alert.source==="https://www.nice.org.uk/guidance/ng246/chapter/Physical-activity-and-diet"){
      const link=node("a","Read clinical guidance about low-calorie diets");
      link.href=alert.source;
      link.target="_blank";
      link.rel="noopener noreferrer";
      card.append(link);
    }
    container.append(card);
  }
}
function chart(id,periods,kind){
  const host=$(id);
  host.replaceChildren();
  const window=periods.slice(0,12).reverse();
  const weight=kind==="weight";
  const values=window.map(period=>weight?period.weightAverage:period.calorieAverage);
  const present=values.filter(value=>value!==null&&Number.isFinite(value));
  if(!present.length){
    host.append(svg("text",{x:305,y:105,"text-anchor":"middle"},
      weight?"No recorded weekly weights yet":"No fully tracked weekly calories yet"));
    return;
  }
  const left=45,right=590,top=18,bottom=181;
  const lo=weight?Math.max(0,Math.floor(Math.min(...present)-3)):0;
  const hi=weight?Math.ceil(Math.max(...present)+3):Math.max(...present,300);
  const height=Math.max(1,hi-lo);
  const y=value=>bottom-(value-lo)/height*(bottom-top);
  const width=(right-left)/window.length;
  for(let step=0;step<=4;step++){
    const pos=bottom-(bottom-top)*step/4;
    host.append(svg("line",{x1:left,y1:pos,x2:right,y2:pos,class:"axis-grid"}));
    const label=lo+(hi-lo)*step/4;
    host.append(svg("text",{x:left-8,y:pos+4,"text-anchor":"end"},
      weight?label.toFixed(0):Math.round(label)));
  }
  if(weight){
    let previous=null;
    values.forEach((value,index)=>{
      if(value===null||!Number.isFinite(value)){previous=null;return;}
      const x=left+width*(index+.5),yy=y(value);
      if(previous){
        host.append(svg("line",{x1:previous.x,y1:previous.y,x2:x,y2:yy,class:"line"}));
      }
      const dot=svg("circle",{cx:x,cy:yy,r:4,class:"dot"});
      dot.append(svg("title",{},window[index].start+": "+pounds(value)));
      host.append(dot);
      previous={x,y:yy};
    });
  }else{
    values.forEach((value,index)=>{
      if(value===null||!Number.isFinite(value))return;
      const x=left+width*index+3,yy=y(value);
      const bar=svg("rect",{x,y:yy,width:Math.max(3,width-6),
        height:Math.max(1,bottom-yy),rx:3,class:"bar"});
      bar.append(svg("title",{},window[index].start+": "+calories(value)+
        " averaged across "+window[index].loggedDays+" tracked day(s)"));
      host.append(bar);
    });
  }
  for(let i=0;i<window.length;i++){
    if(i!==0&&i!==window.length-1&&i%3!==0)continue;
    host.append(svg("text",{x:left+width*(i+.5),y:207,"text-anchor":"middle"},
      window[i].start.slice(5)));
  }
}
function formatMonth(key){
  const [y,m]=key.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined,{month:"long",year:"numeric"})
    .format(new Date(y,m-1,15));
}
function periodLabel(period,type){
  return type==="month"?formatMonth(period.key):
    period.start+" to "+period.end;
}
function valueOrUntracked(day){
  if(!Array.isArray(day.foods)||!day.foods.length)return "Untracked";
  const known=day.foods.filter(food=>food?.calories!==null&&
    food?.calories!==undefined&&!(typeof food.calories==="string"&&!food.calories.trim()));
  if(!known.length)return "Untracked";
  const total=calories(caloriesOn(day));
  return hasCompleteFoodLog(day)?total:total+" + Untracked";
}
function periodBreakdown(period){
  const body=node("div",undefined,"profile-health-period-body");
  const count=period.untrackedFoodItems;
  body.append(node("p","Food totals are averages of "+period.loggedDays+
    " fully tracked day(s). "+period.weightDays+" weigh-in(s). "+
    (count?count+" food item(s) have Untracked calories. ":"")+
    "An empty diary is not zero calories.","profile-health-period-note"));
  const summary=node("p","Meals: "+Object.entries(period.mealCounts)
    .filter(([,n])=>n>0).map(([meal,n])=>meal+" "+n).join(" · ")+
    (Object.values(period.mealCounts).some(Boolean)?"":"no meals logged")+
    ". Workouts: "+period.workoutCount+" session(s), "+period.workoutMinutes+" min.",
    "profile-health-period-note");
  body.append(summary);
  if(period.weightChange!==null){
    const change=(period.weightChange>0?"+":"")+period.weightChange.toFixed(1)+" lb";
    body.append(node("p","First-to-last morning weight change this period: "+
      change+". Daily fluctuations are normal.","profile-health-period-note"));
  }
  if(!period.days.length){
    body.append(node("p","No diary records in this period. All calorie and weight values are Untracked.","profile-health-empty"));
    return body;
  }
  const container=node("div",undefined,"profile-health-breakdown");
  const table=document.createElement("table");
  const head=document.createElement("thead"),tr=document.createElement("tr");
  for(const heading of ["Date","Calories","Food items","Morning weight","Workout time"]){
    const th=node("th",heading);th.scope="col";tr.append(th);
  }
  head.append(tr);table.append(head);
  const tbody=document.createElement("tbody");
  for(const day of period.days){
    const row=document.createElement("tr");
    const cells=[
      day.date,
      valueOrUntracked(day),
      Array.isArray(day.foods)?String(day.foods.length):"0",
      Number(day.weightLb)>0?pounds(day.weightLb):"Not logged",
      workoutMinutes(day)+" min"
    ];
    for(const cell of cells)row.append(node("td",cell));
    tbody.append(row);
  }
  table.append(tbody);container.append(table);body.append(container);
  return body;
}
function makePeriod(period,type){
  const outer=node("details",undefined,"profile-health-period");
  const heading=node("summary");
  heading.append(node("span",periodLabel(period,type)));
  const sub=node("span",undefined,"profile-health-period-summary");
  const calorieText=period.calorieAverage===null?"Calories: Untracked":
    "Calories: "+calories(period.calorieAverage)+" avg";
  const weightText=period.weightAverage===null?"Weight: Not logged":
    "Weight: "+pounds(period.weightAverage)+" avg";
  sub.append(node("strong",calorieText),node("span",weightText),
    node("span",period.workoutMinutes+" workout min"),
    node("span",period.loggedDays+" tracked food days"));
  heading.append(sub);outer.append(heading);
  // Build daily breakdown only when expanded, reducing large history DOMs.
  outer.addEventListener("toggle",()=>{
    if(!outer.open||outer.dataset.loaded==="true")return;
    outer.append(periodBreakdown(period));
    outer.dataset.loaded="true";
  });
  return outer;
}
function renderHistory(){
  const year=yearSelect.value;
  const lists=[
    {items:weeks,type:"week",target:"profile-health-weekly-breakdown",
      count:"profile-health-week-total"},
    {items:months,type:"month",target:"profile-health-monthly-breakdown",
      count:"profile-health-month-total"}
  ];
  for(const {items,type,target,count} of lists){
    const shown=year==="all"?items:
      items.filter(item=>item.start.slice(0,4)===year);
    const host=$(target);host.replaceChildren();
    $(count).textContent=shown.length+
      " "+type+(shown.length===1?"":"s")+" "+(year==="all"?"in history":"in "+year);
    if(!shown.length){
      host.append(node("p","No "+type+"ly records for this year.","profile-health-empty"));
      continue;
    }
    const frag=document.createDocumentFragment();
    for(const item of shown)frag.append(makePeriod(item,type));
    host.append(frag);
  }
}
function populateYears(){
  const current=yearSelect.value;
  const years=[...new Set(months.map(p=>p.start.slice(0,4)))].sort().reverse();
  yearSelect.replaceChildren(new Option("All years","all"));
  for(const year of years)yearSelect.append(new Option(year,year));
  yearSelect.value=years.includes(current)?current:"all";
}
function render(){
  currentWeekAndMonth();
  renderAlerts();
  populateYears();
  renderHistory();
  chart("profile-health-calorie-chart",weeks,"calories");
  chart("profile-health-weight-chart",weeks,"weight");
}
async function refresh(force=false){
  const user=auth.currentUser;
  if(!user){clearPanels();message("Sign in to view private Health analytics.");return;}
  if(loading)return loading;
  if(!force&&currentUid===user.uid&&lastLoaded&&Date.now()-lastLoaded<REFRESH_MS)return;
  const uid=user.uid,token=generation;
  refreshButton.disabled=true;
  message("Loading your health history from Firestore...");
  loading=(async()=>{
    try{
      // The profile needs each historical week and month, not a 45-day
      // capped sample. Query only this member's private subcollection.
      // One read per saved day, no cross-user queries or public storage.
      const snapshot=await getDocsFromServer(collection(db,"users",uid,"healthDays"));
      if(token!==generation||auth.currentUser?.uid!==uid)return;
      history=validHistoryDays(snapshot.docs.map(s=>({...s.data(),date:s.id})),localDay());
      weeks=buildPeriodHistory(history,localDay(),"week");
      months=buildPeriodHistory(history,localDay(),"month");
      currentUid=uid;
      lastLoaded=Date.now();
      render();
      message(history.length?
        "Loaded "+history.length+" private journal day(s), "+weeks.length+
        " week(s) and "+months.length+" month(s). Expand periods for details.":
        "No health records yet. Open Health Tracker to start logging.");
    }catch(error){
      if(token!==generation)return;
      clearPanels();
      message("Unable to load your health analytics: "+
        (error?.message||"unknown error")+
        ". Check your Firestore health rules and internet connection.",true);
    }finally{
      if(token===generation){
        refreshButton.disabled=false;
        loading=null;
      }
    }
  })();
  return loading;
}
function resetForUser(user){
  ++generation;loading=null;currentUid=user?.uid||null;lastLoaded=0;
  clearPanels();refreshButton.disabled=!user;
  message(user?"Open Health to load private analytics.":"Sign in to view private Health analytics.");
  if(user&&location.hash==="#tab-health")void refresh(true);
}
button?.addEventListener("click",()=>void refresh());
refreshButton?.addEventListener("click",()=>void refresh(true));
yearSelect?.addEventListener("change",renderHistory);
window.addEventListener("hashchange",()=>{
  if(location.hash==="#tab-health")void refresh();
});
onAuthStateChanged(auth,user=>{
  if((user?.uid||null)!==currentUid)resetForUser(user);
  else if(user&&location.hash==="#tab-health"&&!lastLoaded)void refresh();
});
