// Original local artwork, shared by homepage encounters and the profile collection.
export const HOME_REEF=[
 ["pip","Pip","#f9b9cf","#8adbd3","bubble"],
 ["hex","Hex","#50203f","#f04761","horns"]
];
export function homeReefPortrait(id,reveal=true){
 const friend=HOME_REEF.find(f=>f[0]===id);if(!friend)return "";
 const [,name,body,gill]=friend,dark=id==="hex";
 const tail=dark?'<path d="M143 125Q181 125 185 101L177 103L190 78L202 104L195 103Q199 141 149 146Z" fill="#a92d49"/>':'<path d="M140 119Q193 106 204 141Q176 153 146 138Z" fill="#88d6d0"/>';
 const horns=dark?'<path d="M71 50Q56 13 79 8Q76 28 94 39M149 50Q164 13 141 8Q144 28 126 39" fill="#b42f4e"/>':'';
 const face=dark?'<g fill="#ffb851"><path d="M76 72l23 6q-8 18-18 6zM144 72l-23 6q8 18 18 6z"/></g><g stroke="#33162c" stroke-width="3" stroke-linecap="round"><path d="M78 67l22 7M142 67l-22 7"/></g><path d="M93 91q17 20 34 0q-17 9-34 0z" fill="#180f1c"/><path d="M97 94l5 9 4-6M114 97l4 6 5-9" fill="#fff0cf"/>':'<g fill="#33394e"><circle cx="87" cy="79" r="6"/><circle cx="133" cy="79" r="6"/></g><g fill="#fff"><circle cx="85" cy="77" r="2"/><circle cx="131" cy="77" r="2"/></g><path d="M103 90q7 9 14 0" stroke="#794661" stroke-width="3" fill="none" stroke-linecap="round"/><g stroke="#69c8c4" stroke-width="2" fill="#e6fffa"><circle cx="111" cy="26" r="9"/><circle cx="130" cy="16" r="5"/><circle cx="96" cy="13" r="4"/></g>';
 return '<svg viewBox="0 0 220 166" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="'+(reveal?name:"A mysterious axolotl")+'"><g stroke="'+(dark?"#211529":"#4c526d")+'" stroke-width="3" stroke-linejoin="round">'+tail+'<ellipse cx="110" cy="122" rx="43" ry="31" fill="'+body+'"/><ellipse cx="110" cy="133" rx="25" ry="17" fill="'+(dark?"#7d385b":"#fff1dc")+'"/><path d="M70 124q-29 0-25 16q12 9 27-6M150 124q29 0 25 16q-12 9-27-6" fill="'+body+'"/><g fill="'+gill+'"><path d="M63 65Q25 14 40 15Q62 15 79 58L63 75Q21 58 15 80Q27 105 66 91Z"/><path d="M157 65Q195 14 180 15Q158 15 141 58L157 75Q199 58 205 80Q193 105 154 91Z"/></g>'+horns+'<ellipse cx="110" cy="77" rx="57" ry="42" fill="'+body+'"/></g><g fill="#e977a0" opacity=".65"><ellipse cx="72" cy="91" rx="9" ry="5"/><ellipse cx="148" cy="91" rx="9" ry="5"/></g>'+face+'</svg>';
}
