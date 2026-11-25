import {zipStore} from "./docs-word-export.js";
import {QUESTIONS,SECTIONS,SURVEY_TITLE,answerText,validateAnswers} from "./survey-schema.js";
const xml=value=>String(value??"").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const X='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const W="http://schemas.openxmlformats.org/wordprocessingml/2006/main";
function paragraph(value,{bold=false,size=20,color="222222",pageBreak=false,keep=false}={}){
 const runs=String(value).split(/\r?\n/).map(line=>'<w:r><w:rPr>'+(bold?'<w:b/>':"")+'<w:sz w:val="'+size+'"/><w:color w:val="'+color+'"/></w:rPr><w:t xml:space="preserve">'+xml(line)+'</w:t></w:r>').join('<w:r><w:br/></w:r>');
 return '<w:p><w:pPr>'+(pageBreak?'<w:pageBreakBefore/>':"")+(keep?'<w:keepNext/>':"")+'<w:spacing w:after="100"/></w:pPr>'+runs+'</w:p>';
}
export function surveyResultsDocx(responses){
 let body="";
 responses.forEach((response,index)=>{
  const answers=validateAnswers(response.answers);
  body+=paragraph(SURVEY_TITLE,{bold:true,size:30,pageBreak:index>0,keep:true});
  body+=paragraph("Anonymous response "+(index+1)+(response.submittedOn?" · "+response.submittedOn:""),{size:20,keep:true});
  if(response.isTest)body+=paragraph("TEST",{bold:true,size:80,color:"C62828",keep:true});
  let section=-1;
  for(const question of QUESTIONS){
   if(section!==question.section){section=question.section;body+=paragraph(SECTIONS[section],{bold:true,size:24,keep:true});}
   body+=paragraph(question.number+". "+question.label,{bold:true,keep:true});
   if(question.hint)body+=paragraph(question.hint,{size:18,keep:true});
   body+=paragraph(answerText(question,answers));
  }
 });
 if(!responses.length)body=paragraph("No survey responses.");
 const document=X+'<w:document xmlns:w="'+W+'"><w:body>'+body+'<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="900" w:right="1080" w:bottom="900" w:left="1080"/></w:sectPr></w:body></w:document>';
 const relationships=X+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
 const content=X+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
 return zipStore([["[Content_Types].xml",content],["_rels/.rels",relationships],["word/document.xml",document]]);
}
