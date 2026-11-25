export const SURVEY_ID="transgender-public-attitudes-v1";
export const SURVEY_VERSION=1;
export const SURVEY_REWARD=500;
export const SURVEY_TITLE="Public attitudes toward transgender people";
export const TEXT_LIMIT=2000;
export const SECTIONS=["Background and perceptions","Possible influences","Your perspective","Understanding and possible solutions"];
const single=(id,section,label,options)=>({id,section,label,type:"single",options});
export const QUESTIONS=Object.freeze([
 single("q01",0,"What is your age group?",["Under 18","18–24","25–34","35–44","45–54","55–64","65 or older","Prefer not to answer"]),
 single("q02",0,"How familiar are you with transgender people and their experiences?",["Very familiar","Somewhat familiar","Not very familiar","Not at all familiar","Unsure"]),
 single("q03",0,"Do you personally know someone who is transgender?",["Yes","No","Unsure","Prefer not to answer"]),
 single("q04",0,"How common do you believe hostility toward transgender people is in the United States?",["Very common","Somewhat common","Not very common","Not at all common","Unsure"]),
 single("q05",0,"Compared with five years ago, how do you think hostility toward transgender people has changed?",["Increased","Stayed about the same","Decreased","Unsure"]),
 single("q06",0,"How would you describe your own general attitude toward transgender people?",["Very positive","Somewhat positive","Neutral","Somewhat negative","Very negative","Prefer not to answer"]),
 {id:"q07",section:1,type:"multi",label:"Which factors, if any, do you believe contribute to hostility toward transgender people?",hint:"Select all that apply.",options:["Lack of understanding","Misinformation","Political rhetoric","Religious beliefs or interpretations","Traditional gender expectations","Family or peer influence","Social media or news coverage","Fear of social change","Limited personal contact","Other","None of these","Unsure"]},
 {id:"q08",section:1,type:"text",label:"Which one of the factors above do you believe has the greatest influence, if any? Why?"},
 {id:"q09",section:1,type:"matrix",label:"How much influence do you believe the following have on public attitudes toward transgender people?",hint:"1 = None · 2 = A little · 3 = Moderate · 4 = A lot · ? = Unsure",rows:["Social media","News media","Political leaders","Religious communities","Family and friends","Schools and education"],options:["1","2","3","4","?"]},
 single("q10",1,"Do you think public discussions about transgender people are generally accurate and fair?",["Always","Often","Sometimes","Rarely","Never","Unsure"]),
 {id:"q11",section:2,type:"text",label:"In your own words, why do you think some people develop negative attitudes toward transgender people?"},
 {id:"q12",section:2,type:"text",label:"What experiences, messages or sources of information have shaped your own views on transgender people?"},
 {id:"q13",section:2,type:"text",label:"Have you noticed any examples of prejudice, acceptance or changing attitudes toward transgender people? If so, describe them without identifying anyone."},
 {id:"q14",section:2,type:"text",label:"What role, if any, do you think politics, religion or cultural expectations play in shaping these attitudes?"},
 single("q15",3,"Do you believe learning about transgender people’s experiences can change negative attitudes?",["Definitely yes","Probably yes","Probably no","Definitely no","Unsure"]),
 {id:"q16",section:3,type:"text",label:"What do you think could reduce hostility or improve understanding between people with different views?"},
 {id:"q17",section:3,type:"text",label:"What do you think is commonly misunderstood about transgender people, if anything?"},
 {id:"q18",section:3,type:"text",label:"Is there anything else you would like to share about public attitudes toward transgender people?"}
].map((question,index)=>Object.freeze({...question,number:index+1})));

const record=value=>!!value&&typeof value==="object"&&!Array.isArray(value);
function invalid(){throw Object.assign(Error("Invalid survey answers."),{publicCode:"PTG-007",status:400});}
export function validateAnswers(value){
 if(!record(value))invalid();
 const allowed=new Set([...QUESTIONS.map(q=>q.id),"q07Other"]);
 if(Object.keys(value).some(key=>!allowed.has(key)))invalid();
 const clean={};
 for(const q of QUESTIONS){
  if(!Object.hasOwn(value,q.id))continue;
  const answer=value[q.id];
  if(q.type==="text"){
   if(typeof answer!=="string"||answer.length>TEXT_LIMIT)invalid();
   if(answer.trim())clean[q.id]=answer.trim();
  }else if(q.type==="single"){
   if(!Number.isInteger(answer)||answer<0||answer>=q.options.length)invalid();
   clean[q.id]=answer;
  }else if(q.type==="multi"){
   if(!Array.isArray(answer)||answer.length>q.options.length||new Set(answer).size!==answer.length||answer.some(n=>!Number.isInteger(n)||n<0||n>=q.options.length))invalid();
   if(answer.length>1&&answer.some(n=>q.options[n]==="None of these"||q.options[n]==="Unsure"))invalid();
   if(answer.length)clean[q.id]=[...answer].sort((a,b)=>a-b);
  }else{
   if(!record(answer)||Object.keys(answer).some(key=>!/^r[0-5]$/.test(key)))invalid();
   const rows={};
   for(let row=0;row<q.rows.length;row++)if(Object.hasOwn(answer,"r"+row)){
    const n=answer["r"+row];if(!Number.isInteger(n)||n<0||n>=q.options.length)invalid();rows["r"+row]=n;
   }
   if(Object.keys(rows).length)clean[q.id]=rows;
  }
 }
 if(Object.hasOwn(value,"q07Other")){
  if(typeof value.q07Other!=="string"||value.q07Other.length>300||!clean.q07?.includes(9))invalid();
  if(value.q07Other.trim())clean.q07Other=value.q07Other.trim();
 }
 return clean;
}
export function answerText(question,answers={}){
 const answer=answers[question.id];
 if(answer===undefined)return "No answer";
 if(question.type==="text")return String(answer);
 if(question.type==="single")return question.options[answer]??"No answer";
 if(question.type==="multi")return answer.map(n=>question.options[n]+(n===9&&answers.q07Other?": "+answers.q07Other:"")).join("; ")||"No answer";
 return question.rows.map((label,i)=>label+": "+(question.options[answer["r"+i]]??"No answer")).join("\n");
}
