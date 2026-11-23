import {auth,db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {collection,getDocsFromServer,query,where,orderBy,limit}
  from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {localDay,shiftDay,weeklyStats,monthlyStats,pounds,calories}
  from "./health-math.js";

const $=id=>document.getElementById(id);
const button=$("profile-tab-health");
let loading=false,lastUid=null,lastLoaded=0;
function message(content){$("profile-health-status").textContent=content;}
function reset(){
  $("profile-health-weight").textContent="Not logged";
  $("profile-health-week").textContent="Not logged";
  $("profile-health-month").textContent="Not logged";
  $("profile-health-workout").textContent="0 min";
}
async function refresh(force=false){
  const user=auth.currentUser;
  if(!user){reset();message("Sign in to view your private health summary.");return;}
  if(loading)return;
  if(!force&&lastUid===user.uid&&Date.now()-lastLoaded<60000)return;
  loading=true;message("Loading your private health summary...");
  try{
    const today=localDay();
    const q=query(collection(db,"users",user.uid,"healthDays"),
      where("date",">=",shiftDay(today,-45)),orderBy("date","desc"),limit(70));
    const result=await getDocsFromServer(q);
    if(auth.currentUser?.uid!==user.uid)return;
    const days=result.docs.map(snapshot=>({...snapshot.data(),date:snapshot.id}));
    const week=weeklyStats(days,today),month=monthlyStats(days,today);
    const weights=days.filter(day=>Number(day.weightLb)>0&&day.date<=today)
      .sort((a,b)=>b.date.localeCompare(a.date));
    $("profile-health-weight").textContent=weights.length?pounds(weights[0].weightLb):"Not logged";
    $("profile-health-week").textContent=week.calorieAverage===null?"Not logged":
      calories(week.calorieAverage)+" ("+week.loggedDays+" days)";
    $("profile-health-month").textContent=month.calorieAverage===null?"Not logged":
      calories(month.calorieAverage)+" ("+month.loggedDays+" days)";
    $("profile-health-workout").textContent=week.workoutMinutes+" min";
    lastUid=user.uid;lastLoaded=Date.now();
    message("Only you can see this summary. Open the full tracker to add or edit entries.");
  }catch(error){
    reset();message("Summary unavailable. The Health Tracker may need its Firestore rules installed: "+
      (error?.message||"unknown error"));
  }finally{loading=false;}
}
button?.addEventListener("click",()=>void refresh(true));
if(location.hash==="#tab-health")void refresh(true);
onAuthStateChanged(auth,user=>{
  if(!user){lastUid=null;lastLoaded=0;reset();}
  else if(location.hash==="#tab-health")void refresh(true);
});
