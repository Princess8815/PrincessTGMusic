// Clues are cosmetic only. Never use this mapping to grant ownership.
export const STORE_AXOLOTL_CLUE="show me your wallet";
export const REEF_CLUES=Object.freeze({
 hangy:"Win your very first game of Hanggirl.",
 flippy:"Twenty-five Hanggirl victories should flip your luck.",
 magica:"A hundred Hanggirl wins might work a little magic.",
 sleepy:"Start with an Easy Hanggirl victory. No need to lose sleep!",
 wordy:"Five Easy Hanggirl wins in a row. Words are your friends.",
 lazy:"Try winning a Medium Hanggirl round.",
 impressionate:"Impress me with five Medium Hanggirl wins in a row.",
 mindful:"Put your mind to a Hard Hanggirl victory.",
 wired:"Five Hard Hanggirl wins in a row. Don't let the wires cross!",
 appey:"Catch at least 50 apples in Apple Catcher, then keep catching.",
 fruiter:"???",
 cheribelle:"Plant a second tree in Cherry Empire and keep harvesting.",
 peachiboo:"Not every peach is peach-colored. Try picking a blue one.",
 pearlie:"Defeat your first Giving Tree boss, then keep growing pears.",
 pip:"Listen closely on the homepage. A tiny friend wants a click.",
 hex:"The homepage has a button you definitely shouldn't press.",
 marina:"I followed the directions and the page was gone. Who ate the map?",
 luna:"My GPS says I'm orbiting a page that doesn't exist.",
 sprout:"I planted a link. Apparently it grew absolutely nothing.",
 sunny:"Even my royal search party couldn't find this page.",
 pearl:"I checked every shell. Not a single webpage inside!",
 bubbles:"A bubbly little helper is waiting in PrincessTG Docs.",
 pebble:"Try following an external link from a published document.",
 nori:"Some waters are reserved for signed-in users. Visit one as a guest.",
 shelly:"A little shopping trip to the music and merchandise store might help.",
 tide:"ty for the support"
});
export function reefClue(id){return REEF_CLUES[id]||"???";}
let serial=0;
export function attachReefClue(card,clue){
 card.classList.add("reef-clue-card");
 card.tabIndex=0;
 const tip=document.createElement("span");
 tip.className="reef-clue-tip";
 tip.id="reef-clue-"+(++serial);
 tip.setAttribute("role","tooltip");
 tip.textContent=clue;
 card.setAttribute("aria-describedby",tip.id);
 card.append(tip);
 // Tapping a mystery card also reveals the clue via keyboard-style focus.
 card.addEventListener("click",()=>card.focus({preventScroll:true}));
}
