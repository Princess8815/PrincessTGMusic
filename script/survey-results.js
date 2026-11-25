// Fetch every page for exports; the visible page and filter never limit it.
export async function allSurveyResponses(fetchPage,isCurrent=()=>true){
 const results=[];let cursor=null;
 do{
  if(!isCurrent())throw Object.assign(Error("Access changed."),{publicCode:"PTG-003"});
  const page=await fetchPage(cursor);
  if(!isCurrent())throw Object.assign(Error("Access changed."),{publicCode:"PTG-003"});
  results.push(...page.responses);cursor=page.next;
 }while(cursor);
 return results;
}
