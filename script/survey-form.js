import {QUESTIONS,SECTIONS,TEXT_LIMIT,validateAnswers} from "./survey-schema.js";
const element=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
export function renderSurveyForm(container){
 container.replaceChildren();let section;
 for(const [index,title] of SECTIONS.entries()){
  section=element("section");section.className="survey-section";section.append(element("h2",title));container.append(section);
  for(const question of QUESTIONS.filter(q=>q.section===index)){
   const group=element("fieldset");group.className="survey-question";group.id=question.id;group.append(element("legend",question.number+". "+question.label));
   if(question.hint){const hint=element("p",question.hint);hint.className="survey-hint";group.append(hint);}
   if(question.type==="text"){
    const input=element("textarea");input.name=question.id;input.maxLength=TEXT_LIMIT;input.setAttribute("aria-label",question.label);group.append(input);
    const hint=element("small","Up to "+TEXT_LIMIT.toLocaleString()+" characters.");hint.className="survey-hint";group.append(hint);
   }else if(question.type==="matrix"){
    question.rows.forEach((row,i)=>{
     const label=element("label");label.className="survey-matrix-row";label.append(element("span",row));
     const select=element("select");select.name=question.id+".r"+i;select.append(new Option("No answer",""));
     question.options.forEach((option,n)=>select.append(new Option(option,String(n))));label.append(select);group.append(label);
    });
   }else{
    question.options.forEach((option,n)=>{
     const label=element("label");label.className="survey-option";
     const input=element("input");input.type=question.type==="multi"?"checkbox":"radio";input.name=question.id;input.value=String(n);label.append(input,element("span",option));group.append(label);
    });
    const clear=element("button","Clear answer");clear.type="button";clear.className="survey-clear";
    clear.addEventListener("click",()=>{for(const input of group.querySelectorAll("input"))input.checked=false;otherVisibility();});group.append(clear);
   }
   if(question.id==="q07"){
    const label=element("label","Other (optional)");label.hidden=true;label.id="q07-other-label";
    const input=element("input");input.type="text";input.name="q07Other";input.maxLength=300;label.append(input);group.append(label);
    group.addEventListener("change",event=>{
     const target=event.target;
     if(target.type==="checkbox"&&target.checked){
      for(const checkbox of group.querySelectorAll('input[type="checkbox"]'))
       if(checkbox!==target&&(Number(target.value)>=10||Number(checkbox.value)>=10))checkbox.checked=false;
     }
     otherVisibility();
    });
   }
   section.append(group);
  }
 }
 function otherVisibility(){
  const label=container.querySelector("#q07-other-label");if(!label)return;
  const active=!!container.querySelector('input[name="q07"][value="9"]')?.checked;
  label.hidden=!active;label.querySelector("input").disabled=!active;
 }
 otherVisibility();
}
export function collectSurveyAnswers(form){
 const data=new FormData(form),answers={};
 for(const q of QUESTIONS){
  if(q.type==="multi"){
   const values=data.getAll(q.id).map(Number);if(values.length)answers[q.id]=values;
  }else if(q.type==="matrix"){
   const values={};q.rows.forEach((_,i)=>{const n=data.get(q.id+".r"+i);if(n!==null&&n!=="")values["r"+i]=Number(n);});
   if(Object.keys(values).length)answers[q.id]=values;
  }else{
   const text=data.get(q.id);if(text!==null&&text!=="")answers[q.id]=q.type==="text"?text:Number(text);
  }
 }
 if(answers.q07?.includes(9)&&data.get("q07Other"))answers.q07Other=data.get("q07Other");
 return validateAnswers(answers);
}
