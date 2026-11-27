// Clues are cosmetic only. Never use this mapping to grant ownership.
export const STORE_AXOLOTL_CLUE="show me your wallet";
export const REEF_CLUES=Object.freeze({
 rookie:"A crown is waiting at the end of the road.",
 bishell:"Every great voyage begins with a single triumph.",
 pawny:"Little victories make a mighty army.",
 ninite:"An unusual leap can close the final door.",
 "king-of-the-sea":"One crown is not enough for these waters.",
 quensy:"Royal grace is most impressive when the waters grow rough.",
 "professor-squiggles":"My classroom has room for curious minds.",
 hangy:"Every long chain begins with a single link. Mine is made of letters.",
 flippy:"A quarter of a century, but nobody is getting older.",
 magica:"My magic awakens when two digits are no longer enough.",
 sleepy:"The shallowest waters make the softest pillows.",
 wordy:"In gentle waters, weave a chain with as many links as fingers on one hand.",
 lazy:"Too shallow bores me. Too deep exhausts me. Somewhere between feels just right.",
 impressionate:"Halfway beneath the surface, a hand's worth of linked triumphs would impress me.",
 mindful:"When the letters become teeth, keep your head.",
 wired:"An unbroken circuit in the deepest waters. One spark for every finger on a hand.",
 appey:"Half a hundred gifts from gravity, yet my basket still has room.",
 fruiter:"???",
 cheribelle:"One crown is lonely. When a second takes root, the harvest may bring company.",
 peachiboo:"Among the blushing fruit, seek the one that wears the sky.",
 tangie:"Beyond ten fallen orchards, listen for a little citrus-colored splash.",
 pearlie:"The first mighty crown must fall before the branches can bear my secret.",
 pip:"Where melodies welcome you home, a little face awaits your attention.",
 hex:"Temptation wears a warning. Obedience will never set me free.",
 marina:"I followed the directions and the page was gone. Who ate the map?",
 luna:"My GPS says I'm orbiting a page that doesn't exist.",
 sprout:"I planted a link. Apparently it grew absolutely nothing.",
 sunny:"Even my royal search party couldn't find this page.",
 pearl:"I checked every shell. Not a single webpage inside!",
 bubbles:"Among blank pages and wandering words, a tiny companion waits to make a splash.",
 pebble:"Between the written word and the world beyond, I guard the crossing.",
 nori:"Approach a locked gate without a name, and a little lantern may light your way.",
 shelly:"Where melodies have price tags, a little traveler needs no fare.",
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
