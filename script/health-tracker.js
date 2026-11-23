import {auth,db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {
  collection,doc,getDocFromServer,getDocsFromServer,
  query,where,orderBy,limit,runTransaction,setDoc,serverTimestamp,
  writeBatch,deleteDoc
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {
  localDay,parseDay,shiftDay,mondayOf,monthOf,caloriesOn,workoutMinutes,
  weeklyStats,monthlyStats,recentWeeks,recentMonths,lastDays,pounds,calories
} from "./health-math.js";
import {searchFoods} from "./health-foods.js";

const $=id=>document.getElementById(id);
const TODAY=()=>localDay();
const svgNS="http://www.w3.org/2000/svg";
const DEFAULT_SETTINGS={calorieTarget:null,goalWeightLb:null,startingWeightLb:null};
const MEALS=["Breakfast","Lunch","Dinner","Snack","Other"];
const state={user:null,settings:{...DEFAULT_SETTINGS},days:new Map(),
  day:TODAY(),planDate:TODAY(),ready:false,busy:false,version:0,tab:"dashboard"};
const isFuture=date=>date>TODAY();
const number=(value,min,max)=>{
  const n=Number(value);
  if(!Number.isFinite(n)||n<min||n>max)throw Error("Enter a number between "+min+" and "+max+".");
  return n;
};
const optionalNumber=(value,min,max)=>{
  if(!String(value??"").trim())return null;
  return number(value,min,max);
};
const brief=(value,limit)=>String(value??"").trim().slice(0,limit);
const formatCount=n=>Math.round(Number(n)||0).toLocaleString();
const makeId=()=>globalThis.crypto?.randomUUID?.()||
  Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,9);
const ownDays=uid=>collection(db,"users",uid,"healthDays");
const dayDoc=(uid,date)=>doc(db,"users",uid,"healthDays",date);
const settingsDoc=uid=>doc(db,"users",uid,"healthSettings","main");
const emptyDay=date=>({date,weightLb:null,foods:[],workouts:[],plans:[]});
const getDay=date=>state.days.get(date)||emptyDay(date);
const allDays=()=>[...state.days.values()];
const totalPlanned=day=>(day.plans||[]).reduce((a,p)=>a+(Number(p.calories)||0),0);
function setStatus(text,error=false){
  const el=$("health-sync-status");
  el.textContent=text;
  el.dataset.error=String(!!error);
}
function setBusy(busy){
  state.busy=busy;
  for(const id of ["health-food-form","health-weight-form","health-workout-form",
    "health-plan-form","health-goals-form"]){
    const form=$(id);
    for(const control of form?.querySelectorAll("input,select,button")||[])control.disabled=busy;
  }
  for(const id of ["health-export","health-delete-all"])$(id).disabled=busy;
}
function text(tag,value,cls){
  const n=document.createElement(tag);
  n.textContent=String(value??"");
  if(cls)n.className=cls;
  return n;
}
function svgEl(tag,attrs={},value){
  const e=document.createElementNS(svgNS,tag);
  for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));
  if(value!==undefined)e.textContent=String(value);
  return e;
}
function entryLine(title,subtext,buttons=[]){
  const row=document.createElement("div");
  row.className="health-entry";
  const details=text("div","","health-entry-details");
  details.append(text("strong",title),text("small",subtext));
  const actions=text("div","","health-entry-actions");
  for(const b of buttons){
    const btn=document.createElement("button");
    btn.type="button";
    btn.textContent=b.label;
    if(b.danger)btn.className="health-remove";
    btn.disabled=state.busy;
    btn.addEventListener("click",b.action);
    actions.append(btn);
  }
  row.append(details,actions);
  return row;
}
function emptyList(el,message){
  el.replaceChildren(text("p",message,"health-hint"));
}
function chooseTab(name,hash=true){
  const valid=["dashboard","diary","planner","workouts","progress"];
  state.tab=valid.includes(name)?name:"dashboard";
  for(const button of document.querySelectorAll("[data-health-tab]")){
    const active=button.dataset.healthTab===state.tab;
    button.setAttribute("aria-selected",String(active));
    button.tabIndex=active?0:-1;
  }
  for(const panel of document.querySelectorAll("[data-health-panel]"))
    panel.hidden=panel.dataset.healthPanel!==state.tab;
  if(hash)history.replaceState(null,"","#"+state.tab);
}
async function refreshFromServer(){
  if(!state.user||state.busy)return;
  const uid=state.user.uid;
  setStatus("Refreshing your saved data...");
  try{
    state.days.clear();
    await Promise.all([loadSettings(),loadHistory()]);
    if(state.user?.uid!==uid)return;
    await Promise.all([fetchDay(state.day),fetchDay(state.planDate)]);
    if(state.user?.uid!==uid)return;
    render();void renderPlanWeek();setStatus("Synced with Firestore.");
  }catch(error){setStatus("Refresh failed: "+(error?.message||"unknown error"),true);}
}
async function fetchDay(date,force=false){
  if(!state.user)return emptyDay(date);
  if(!parseDay(date))throw Error("Invalid date.");
  if(!force&&state.days.has(date))return getDay(date);
  const uid=state.user.uid;
  const result=await getDocFromServer(dayDoc(uid,date));
  if(state.user?.uid!==uid)return emptyDay(date);
  const data=result.exists()?result.data():emptyDay(date);
  const normalized={
    ...emptyDay(date),...data,date,
    foods:Array.isArray(data.foods)?data.foods:[],
    workouts:Array.isArray(data.workouts)?data.workouts:[],
    plans:Array.isArray(data.plans)?data.plans:[]
  };
  state.days.set(date,normalized);
  return normalized;
}
async function loadHistory(){
  const uid=state.user.uid;
  const since=shiftDay(TODAY(),-210);
  const q=query(ownDays(uid),where("date",">=",since),orderBy("date","desc"),limit(240));
  const result=await getDocsFromServer(q);
  if(state.user?.uid!==uid)return;
  for(const snapshot of result.docs){
    const value=snapshot.data();
    if(!parseDay(snapshot.id))continue;
    state.days.set(snapshot.id,{
      ...emptyDay(snapshot.id),...value,date:snapshot.id,
      foods:Array.isArray(value.foods)?value.foods:[],
      workouts:Array.isArray(value.workouts)?value.workouts:[],
      plans:Array.isArray(value.plans)?value.plans:[]
    });
  }
}
async function loadSettings(){
  const uid=state.user.uid;
  const result=await getDocFromServer(settingsDoc(uid));
  if(state.user?.uid!==uid)return;
  state.settings={...DEFAULT_SETTINGS,...(result.exists()?result.data():{})};
  $("health-calorie-target").value=state.settings.calorieTarget||"";
  $("health-goal-weight").value=state.settings.goalWeightLb||"";
  $("health-start-weight").value=state.settings.startingWeightLb||"";
}
async function mutateDay(date,modify){
  if(!state.user||!state.ready)throw Error("Sign in to save your health journal.");
  if(!parseDay(date))throw Error("Invalid date.");
  const uid=state.user.uid;
  const ref=dayDoc(uid,date);
  const changed=await runTransaction(db,async tx=>{
    const snap=await tx.get(ref);
    const previous=snap.exists()?snap.data():emptyDay(date);
    const next=modify({
      ...emptyDay(date),...previous,date,
      foods:[...(Array.isArray(previous.foods)?previous.foods:[])],
      workouts:[...(Array.isArray(previous.workouts)?previous.workouts:[])],
      plans:[...(Array.isArray(previous.plans)?previous.plans:[])]
    });
    if(next.foods.length>100||next.workouts.length>60||next.plans.length>60)
      throw Error("This day has too many entries. Remove or split older entries first.");
    const payload={...next,date,updatedAt:serverTimestamp()};
    tx.set(ref,payload);
    return next;
  });
  if(state.user?.uid!==uid)return;
  state.days.set(date,changed);
  render();
}
async function saveAction(action,success){
  if(state.busy)return;
  setBusy(true);
  setStatus("Saving to your private journal...");
  try{
    await action();
    setStatus(success);
  }catch(error){
    console.error("Health tracker save failed",error);
    setStatus("Could not save: "+(error?.message||"unknown error"),true);
  }finally{
    setBusy(false);
    render();
  }
}
function renderFoodLookup(inputId,resultsId,populate=true){
  const search=$(inputId),list=$(resultsId);
  if(!search||!list)return;
  const draw=()=>{
    list.replaceChildren();
    const matches=searchFoods(search.value);
    if(!matches.length){
      list.append(text("p","No quick estimate found. Enter your own food and label calories.","health-hint"));
      return;
    }
    for(const food of matches){
      const item=document.createElement("button");
      item.type="button";item.className="health-food-choice";
      item.append(
        text("span",food.name+" · "+food.portion),
        text("span",formatCount(food.calories)+" kcal")
      );
      item.title="Approximate calories. Food packaging may differ.";
      item.addEventListener("click",()=>{
        if(!populate){
          $("health-public-food-selected").textContent=food.name+" · "+food.portion+
            " · approximately "+calories(food.calories)+". Check the food label for accuracy.";
          return;
        }
        $("health-food-name").value=food.name;
        $("health-food-calories").value=food.calories;
        $("health-food-portion").value=food.portion;
        $("health-food-servings").value="1";
        updateFoodPreview();
        chooseTab("diary");
        $("health-food-name").focus();
      });
      list.append(item);
    }
  };
  search.addEventListener("input",draw);
  draw();
}
function updateFoodPreview(){
  const each=Number($("health-food-calories").value);
  const qty=Number($("health-food-servings").value);
  $("health-food-preview").textContent=
    Number.isFinite(each)&&Number.isFinite(qty)&&each>=0&&qty>0?
      "Total: "+calories(each*qty)+" ("+qty+" serving"+(qty===1?"":"s")+")"
      :"Enter calories and servings to calculate the total.";
}
function renderFoodDiary(day){
  $("health-food-total").textContent=calories(caloriesOn(day));
  const list=$("health-food-list");
  list.replaceChildren();
  if(!day.foods.length){
    emptyList(list,"No food recorded on this date yet.");
    return;
  }
  for(const entry of [...day.foods].reverse()){
    const detail=(entry.meal||"Meal")+" · "+entry.servings+" × "+entry.portion+
      (entry.notes?" · "+entry.notes:"");
    list.append(entryLine(entry.name+" · "+calories(entry.calories),detail,[
      {label:"Remove",danger:true,action:()=>removeEntry(state.day,"foods",entry.id)}
    ]));
  }
}
function renderWeight(day){
  const value=Number(day.weightLb)||0;
  const unit=$("health-weight-unit").value;
  $("health-weight-input").value=value?
    (unit==="kg"?Math.round(value/2.2046226218*10)/10:Math.round(value*10)/10):"";
  $("health-weight-remove").disabled=state.busy||!value||isFuture(state.day);
}
function renderWorkoutDiary(day){
  const list=$("health-workout-list");
  list.replaceChildren();
  $("health-workout-total").textContent=workoutMinutes(day)+" minutes logged";
  if(!day.workouts.length){emptyList(list,"No workouts recorded on this date.");return;}
  for(const entry of [...day.workouts].reverse())
    list.append(entryLine(entry.type+" · "+entry.minutes+" min",
      (entry.effort||"Gentle")+" effort"+(entry.notes?" · "+entry.notes:""),[
      {label:"Remove",danger:true,action:()=>removeEntry(state.day,"workouts",entry.id)}
    ]));
}
function renderPlanDay(day){
  const list=$("health-plan-list");
  list.replaceChildren();
  $("health-plan-heading-date").textContent=state.planDate;
  if(!day.plans.length){emptyList(list,"Nothing planned for this day yet.");return;}
  for(const plan of day.plans){
    const buttons=[];
    if(!isFuture(state.planDate)){
      buttons.push({label:"Log as eaten",action:()=>logPlannedMeal(state.planDate,plan)});
    }
    buttons.push({label:"Remove",danger:true,
      action:()=>removeEntry(state.planDate,"plans",plan.id)});
    list.append(entryLine(plan.meal+": "+plan.name+" · "+calories(plan.calories),
      plan.notes||"Planned, not logged",buttons));
  }
}
async function renderPlanWeek(){
  const stamp=state.planDate;
  const uid=state.user?.uid;
  if(!uid)return;
  const dates=Array.from({length:7},(_,i)=>shiftDay(stamp,i));
  try{await Promise.all(dates.map(day=>fetchDay(day)));}
  catch(e){setStatus("Unable to load some planned dates: "+e.message,true);return;}
  if(uid!==state.user?.uid||stamp!==state.planDate)return;
  const wrapper=$("health-planner-week");
  wrapper.replaceChildren();
  for(const date of dates){
    const day=getDay(date);
    const card=text("div","","health-plan-day");
    card.append(text("strong",date.slice(5)),
      text("span",day.plans.length+" planned meal"+(day.plans.length===1?"":"s")),
      text("small",calories(totalPlanned(day))+" planned"));
    const button=document.createElement("button");
    button.type="button";button.textContent="View date";button.className="health-secondary";
    button.addEventListener("click",()=>{
      state.planDate=date;$("health-plan-date").value=date;
      renderPlanDay(getDay(date));
      void renderPlanWeek();
    });
    card.append(button);wrapper.append(card);
  }
}
function drawBarChart(id,days,weight=false){
  const svg=$(id);svg.replaceChildren();
  const rect={left:55,right:695,top:20,bottom:188};
  const values=days.map(day=>weight?
    (Number(day.weightLb)>0?Number(day.weightLb):null):
    (day.foods?.length?caloriesOn(day):null));
  const existing=values.filter(value=>value!==null);
  if(!existing.length){
    svg.append(svgEl("text",{x:360,y:116,"text-anchor":"middle"},
      weight?"No morning weights logged yet":"No calories logged for this period"));
    return;
  }
  const min=weight?Math.floor(Math.min(...existing)-3):0;
  const max=weight?Math.ceil(Math.max(...existing)+3):
    Math.max(...existing,Number(state.settings.calorieTarget)||0,300);
  const spread=Math.max(1,max-min);
  const y=value=>rect.bottom-((value-min)/spread)*(rect.bottom-rect.top);
  for(let i=0;i<=4;i++){
    const value=min+(max-min)*i/4;
    const yy=y(value);
    svg.append(svgEl("line",{x1:rect.left,y1:yy,x2:rect.right,y2:yy,class:"health-plot-grid"}));
    svg.append(svgEl("text",{x:rect.left-8,y:yy+5,"text-anchor":"end"},weight?value.toFixed(0):formatCount(value)));
  }
  const dx=(rect.right-rect.left)/days.length;
  if(weight){
    const points=[];
    values.forEach((value,i)=>{
      if(value===null)return;
      const x=rect.left+dx*(i+.5);
      points.push(x+","+y(value));
      const dot=svgEl("circle",{cx:x,cy:y(value),r:5,class:"health-plot-dot"});
      dot.append(svgEl("title",{},days[i].date+": "+value+" lb"));svg.append(dot);
    });
    if(points.length>1)svg.insertBefore(svgEl("polyline",{points:points.join(" "),class:"health-plot-line"}),svg.querySelector("circle"));
  }else{
    values.forEach((value,i)=>{
      if(value===null)return;
      const x=rect.left+dx*i+2;
      const bar=svgEl("rect",{x,y:y(value),width:Math.max(3,dx-4),
        height:Math.max(1,rect.bottom-y(value)),rx:3,class:"health-plot-bar"});
      bar.append(svgEl("title",{},days[i].date+": "+calories(value)));svg.append(bar);
    });
    const target=Number(state.settings.calorieTarget);
    if(target>0&&target<max){
      svg.append(svgEl("line",{x1:rect.left,y1:y(target),x2:rect.right,y2:y(target),
        class:"health-plot-target"}));
    }
  }
  for(const i of [0,Math.floor((days.length-1)/2),days.length-1]){
    svg.append(svgEl("text",{x:rect.left+dx*(i+.5),y:213,"text-anchor":"middle"},
      days[i].date.slice(5)));
  }
}
function drawTrends(){
  const today=TODAY();
  const make=count=>Array.from({length:count},(_,i)=>{
    const date=shiftDay(today,i-(count-1));
    return getDay(date);
  });
  drawBarChart("health-calorie-chart",make(14),false);
  drawBarChart("health-weight-chart",make(30),true);
}
function renderTable(id,rows,periodTitle){
  const wrapper=$(id);
  const table=document.createElement("table");
  const header=document.createElement("thead");
  const headings=["Period","Days logged","Avg calories / logged day","Avg morning weight","Workout time"];
  const hr=document.createElement("tr");
  headings.forEach(h=>hr.append(text("th",h)));
  header.append(hr);table.append(header);
  const body=document.createElement("tbody");
  for(const row of [...rows].reverse()){
    const tr=document.createElement("tr");
    [row.label,row.loggedDays+" day"+(row.loggedDays===1?"":"s"),
      row.calorieAverage===null?"Not logged":calories(row.calorieAverage),
      row.weightAverage===null?"Not logged":pounds(row.weightAverage),
      row.workoutMinutes+" min"].forEach(value=>tr.append(text("td",value)));
    body.append(tr);
  }
  table.append(body);
  wrapper.replaceChildren(table);
}
function renderAnalytics(){
  const days=allDays(),today=TODAY();
  const week=weeklyStats(days,today),month=monthlyStats(days,today);
  const weekText=week.calorieAverage===null?"Not logged":calories(week.calorieAverage);
  const monthText=month.calorieAverage===null?"Not logged":calories(month.calorieAverage);
  $("health-week-average").textContent=weekText;
  $("health-month-average").textContent=monthText;
  $("health-week-count").textContent=week.loggedDays+" day(s) with food logged";
  $("health-month-count").textContent=month.loggedDays+" day(s) with food logged";
  $("health-analytics-week").textContent=weekText;
  $("health-analytics-month").textContent=monthText;
  $("health-analytics-week-days").textContent=week.loggedDays+" logged day(s)";
  $("health-analytics-month-days").textContent=month.loggedDays+" logged day(s)";
  $("health-analytics-workouts").textContent=week.workoutMinutes+" min";
  $("health-analytics-sessions").textContent=week.workoutCount+" session(s)";
  const goal=Number(state.settings.goalWeightLb);
  $("health-goal-summary").textContent=goal>0?pounds(goal):"Not set";
  const latest=days.filter(day=>Number(day.weightLb)>0&&day.date<=today)
    .sort((a,b)=>b.date.localeCompare(a.date))[0];
  $("health-goal-distance").textContent=goal>0&&latest?
    "Latest: "+pounds(latest.weightLb)+" · Difference: "+
    Math.abs(latest.weightLb-goal).toFixed(1)+" lb":"Log weight to track distance";
  const start=Number(state.settings.startingWeightLb);
  const change=start>0&&latest?latest.weightLb-start:null;
  $("health-weight-change").textContent=change===null?"Not set":
    (change>0?"+":"")+change.toFixed(1)+" lb";
  const totalNeeded=Math.abs(start-goal);
  const achieved=start>goal?start-Number(latest?.weightLb):
    Number(latest?.weightLb)-start;
  $("health-weight-progress").textContent=
    start>0&&goal>0&&latest&&totalNeeded>0?
      Math.max(0,Math.min(100,achieved/totalNeeded*100)).toFixed(0)+"%":
      "Not set";
  renderTable("health-weekly-table",recentWeeks(days,today,8));
  renderTable("health-monthly-table",recentMonths(days,today,6));
  drawTrends();
}
function render(){
  if(!state.ready||!state.user)return;
  const day=getDay(state.day);
  $("health-date").value=state.day;
  $("health-plan-date").value=state.planDate;
  $("health-today-calories").textContent=calories(caloriesOn(day));
  $("health-current-weight").textContent=pounds(day.weightLb);
  const target=Number(state.settings.calorieTarget);
  $("health-target-display").textContent=target>0?calories(target):"Not set";
  const left=target-caloriesOn(day);
  $("health-remaining").textContent=target>0?
    (left>=0?calories(left)+" remaining":calories(-left)+" over target"):"Set a target";
  $("health-day-summary").textContent=state.day+": "+
    day.foods.length+" food entry/entries · "+calories(caloriesOn(day))+
    " · "+day.workouts.length+" workout(s) · "+
    (day.weightLb?pounds(day.weightLb):"No morning weight")+".";
  renderFoodDiary(day);
  renderWeight(day);
  renderWorkoutDiary(day);
  renderPlanDay(getDay(state.planDate));
  renderAnalytics();
  const future=isFuture(state.day);
  for(const id of ["health-food-form","health-workout-form","health-weight-form"]){
    const form=$(id);
    for(const control of form.querySelectorAll("input,select,button"))control.disabled=future||state.busy;
  }
  for(const el of document.querySelectorAll("#health-food-list button,#health-workout-list button"))
    el.disabled=future||state.busy;
}
async function removeEntry(date,field,id){
  if(!confirm("Remove this entry?"))return;
  await saveAction(()=>mutateDay(date,day=>{
    day[field]=day[field].filter(entry=>entry.id!==id);return day;
  }),"Entry removed.");
  if(field==="plans")void renderPlanWeek();
}
async function logPlannedMeal(date,plan){
  if(isFuture(date)){setStatus("Future plans can be logged when that day arrives.",true);return;}
  await saveAction(()=>mutateDay(date,day=>{
    day.foods.push({
      id:makeId(),name:plan.name,meal:plan.meal,portion:"planned meal",
      servings:1,unitCalories:plan.calories,calories:plan.calories,
      notes:plan.notes||"Added from meal plan"
    });
    return day;
  }),"Planned meal logged to your food diary.");
}
async function changeDay(date){
  if(!parseDay(date)){setStatus("Choose a valid journal date.",true);return;}
  state.day=date;
  $("health-date").value=date;
  if(!state.user||!state.ready)return;
  try{
    setStatus("Loading "+date+"...");
    await fetchDay(date);
    render();setStatus("Viewing "+date+".");
  }catch(error){setStatus("Unable to load selected date: "+error.message,true);}
}
async function changePlanDate(date){
  if(!parseDay(date)){setStatus("Choose a valid planning date.",true);return;}
  state.planDate=date;$("health-plan-date").value=date;
  try{
    await fetchDay(date);
    renderPlanDay(getDay(date));
    void renderPlanWeek();
  }catch(error){setStatus("Could not open meal plan: "+error.message,true);}
}
function wireEvents(){
  for(const button of document.querySelectorAll("[data-health-tab]"))
    button.addEventListener("click",()=>chooseTab(button.dataset.healthTab));
  for(const button of document.querySelectorAll("[data-health-jump]"))
    button.addEventListener("click",()=>chooseTab(button.dataset.healthJump));
  $("health-guest-signin").addEventListener("click",()=>{
    const authButton=$("auth-open");
    if(authButton&&!authButton.hidden)authButton.click();
    else alert("Use the site's Login / Register button in the account menu.");
  });
  $("health-date").value=state.day;
  $("health-plan-date").value=state.planDate;
  $("health-date").addEventListener("change",event=>void changeDay(event.target.value));
  $("health-today-button").addEventListener("click",()=>void changeDay(TODAY()));
  $("health-refresh").addEventListener("click",()=>void refreshFromServer());
  $("health-prev-day").addEventListener("click",()=>void changeDay(shiftDay(state.day,-1)));
  $("health-next-day").addEventListener("click",()=>void changeDay(shiftDay(state.day,1)));
  $("health-plan-date").addEventListener("change",event=>void changePlanDate(event.target.value));
  $("health-weight-unit").addEventListener("change",()=>renderWeight(getDay(state.day)));
  for(const id of ["health-food-calories","health-food-servings"])
    $(id).addEventListener("input",updateFoodPreview);
  renderFoodLookup("health-food-search","health-food-results",true);
  renderFoodLookup("health-public-food-search","health-public-food-results",false);
  $("health-weight-form").addEventListener("submit",event=>{
    event.preventDefault();
    if(isFuture(state.day)){setStatus("Log weight only on today or earlier dates.",true);return;}
    const unit=$("health-weight-unit").value;
    const raw=number($("health-weight-input").value,1,1500);
    const lb=unit==="kg"?raw*2.2046226218:raw;
    void saveAction(()=>mutateDay(state.day,day=>{
      day.weightLb=Math.round(lb*10)/10;return day;
    }),"Morning weight saved.");
  });
  $("health-weight-remove").addEventListener("click",()=>{
    if(!confirm("Remove the morning weight for "+state.day+"?"))return;
    void saveAction(()=>mutateDay(state.day,day=>{day.weightLb=null;return day;}),"Weight cleared.");
  });
  $("health-food-form").addEventListener("submit",event=>{
    event.preventDefault();
    const name=brief($("health-food-name").value,120);
    if(!name){setStatus("Enter a food name.",true);return;}
    const unitCalories=number($("health-food-calories").value,0,20000);
    const servings=number($("health-food-servings").value,.05,100);
    const total=Math.round(unitCalories*servings*10)/10;
    if(total>25000){setStatus("Total calories exceed the entry limit.",true);return;}
    const entry={id:makeId(),name,unitCalories,servings,calories:total,
      meal:MEALS.includes($("health-food-meal").value)?$("health-food-meal").value:"Other",
      portion:brief($("health-food-portion").value,80)||"serving",
      notes:brief($("health-food-notes").value,240)};
    const date=state.day;
    void saveAction(async()=>{
      await mutateDay(date,day=>{day.foods.push(entry);return day;});
      $("health-food-form").reset();
      $("health-food-servings").value=1;
      updateFoodPreview();
    },"Food saved to "+date+".");
  });
  $("health-workout-form").addEventListener("submit",event=>{
    event.preventDefault();
    const date=state.day;
    const entry={id:makeId(),type:brief($("health-workout-type").value,80),
      minutes:number($("health-workout-minutes").value,1,1440),
      effort:$("health-workout-effort").value,
      notes:brief($("health-workout-notes").value,240)};
    void saveAction(async()=>{
      await mutateDay(date,day=>{day.workouts.push(entry);return day;});
      $("health-workout-form").reset();
    },"Workout logged.");
  });
  $("health-plan-form").addEventListener("submit",event=>{
    event.preventDefault();
    const date=$("health-plan-date").value;
    if(!parseDay(date)){setStatus("Choose a valid plan date.",true);return;}
    const name=brief($("health-plan-name").value,120);
    if(!name){setStatus("Name the planned meal.",true);return;}
    const entry={id:makeId(),meal:$("health-plan-meal").value,name,
      calories:number($("health-plan-calories").value,0,20000),
      notes:brief($("health-plan-notes").value,280)};
    void saveAction(async()=>{
      await mutateDay(date,day=>{day.plans.push(entry);return day;});
      $("health-plan-name").value="";
      $("health-plan-calories").value="";
      $("health-plan-notes").value="";
      state.planDate=date;
      void renderPlanWeek();
    },"Meal added to "+date+"'s plan.");
  });
  $("health-goals-form").addEventListener("submit",event=>{
    event.preventDefault();
    const calorieTarget=optionalNumber($("health-calorie-target").value,1,20000);
    const goalWeightLb=optionalNumber($("health-goal-weight").value,1,1500);
    const startingWeightLb=optionalNumber($("health-start-weight").value,1,1500);
    const settings={calorieTarget,goalWeightLb,startingWeightLb};
    void saveAction(async()=>{
      await setDoc(settingsDoc(state.user.uid),
        {...settings,updatedAt:serverTimestamp()},{merge:true});
      state.settings={...state.settings,...settings};
    },calorieTarget&&calorieTarget<1200?
      "Goals saved. If your calorie target is unusually low for your needs, review it with a clinician.":"Goals saved.");
  });
  $("health-export").addEventListener("click",()=>void exportData());
  $("health-delete-all").addEventListener("click",()=>void deleteAllData());
  window.addEventListener("hashchange",()=>{
    const tab=location.hash.replace(/^#/,"");
    if(["dashboard","diary","planner","workouts","progress"].includes(tab))chooseTab(tab,false);
  });
  chooseTab(location.hash.replace(/^#/,"")||"dashboard",false);
  updateFoodPreview();
}
async function exportData(){
  if(!state.user||state.busy)return;
  setBusy(true);setStatus("Preparing full export...");
  try{
    const snapshot=await getDocsFromServer(ownDays(state.user.uid));
    const payload={
      exportedAt:new Date().toISOString(),
      format:"princesstg-health-v1",
      settings:state.settings,
      days:snapshot.docs.map(x=>{
        const value=x.data();
        return {...value,date:x.id,
          updatedAt:value.updatedAt?.toDate?.()?.toISOString?.()||null};
      })
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement("a");
    anchor.href=url;anchor.download="health-tracker-"+TODAY()+".json";
    document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    setStatus("Your private health data export is ready.");
  }catch(error){setStatus("Could not export: "+error.message,true);}
  finally{setBusy(false);}
}
async function deleteAllData(){
  if(!state.user||state.busy)return;
  if(!confirm("Delete every saved weight, food, workout and meal plan entry for this account? This cannot be undone."))return;
  if(prompt('Type DELETE to permanently remove the health tracker history and goals:')!=="DELETE")return;
  setBusy(true);setStatus("Deleting health data...");
  try{
    const uid=state.user.uid;
    const result=await getDocsFromServer(ownDays(uid));
    const refs=result.docs.map(s=>s.ref);
    refs.push(settingsDoc(uid));
    for(let i=0;i<refs.length;i+=400){
      const batch=writeBatch(db);
      refs.slice(i,i+400).forEach(ref=>batch.delete(ref));
      await batch.commit();
    }
    if(state.user?.uid!==uid)return;
    state.days.clear();state.settings={...DEFAULT_SETTINGS};
    $("health-goals-form").reset();
    render();void renderPlanWeek();
    setStatus("Your saved health tracker data was deleted.");
  }catch(error){setStatus("Deletion incomplete: "+error.message+
    ". Retry, or contact support if the problem continues.",true);}
  finally{setBusy(false);}
}
async function initializeForUser(user){
  const version=++state.version;
  state.user=user;state.ready=false;state.days.clear();
  state.settings={...DEFAULT_SETTINGS};
  $("health-guest").hidden=!!user;
  $("health-guest-lookup").hidden=!!user;
  $("health-private").hidden=!user;
  if(!user)return;
  setStatus("Loading your private journal...");
  try{
    await Promise.all([loadSettings(),loadHistory()]);
    if(version!==state.version||auth.currentUser?.uid!==user.uid)return;
    await Promise.all([fetchDay(state.day),fetchDay(state.planDate)]);
    if(version!==state.version||auth.currentUser?.uid!==user.uid)return;
    state.ready=true;
    render();void renderPlanWeek();
    setStatus("Your journal is ready. Saved entries sync to your account.");
  }catch(error){
    console.error("Health tracker load failed",error);
    if(version===state.version)setStatus("Unable to load private journal: "+
      error.message+". Check the deployed health Firestore rules and network connection.",true);
  }
}

wireEvents();
onAuthStateChanged(auth,user=>void initializeForUser(user));
