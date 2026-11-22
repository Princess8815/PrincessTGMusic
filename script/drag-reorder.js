// Shared, handle-based HTML drag-and-drop for music lists.
// Dragging a handle avoids interference with Play, Details and checkbox controls.
let activeDrag = null;

function installStyles() {
  if (document.getElementById("ptg-drag-reorder-styles")) return;
  const style = document.createElement("style");
  style.id = "ptg-drag-reorder-styles";
  style.textContent = [
    ".ptg-drag-handle{display:inline-flex;align-items:center;justify-content:center;",
    "min-width:28px;min-height:36px;padding:5px;border-radius:7px;",
    "cursor:grab;touch-action:none;user-select:none;color:#cbb1ff;font-weight:bold;}",
    ".ptg-drag-handle:hover{background:rgba(172,122,255,.18)}",
    ".ptg-drag-handle:active{cursor:grabbing}",
    ".ptg-drag-row--moving{opacity:.55}",
    ".ptg-drag-row--target{outline:2px dashed #c9a0ff;outline-offset:-3px;",
    "background:rgba(168,115,255,.14)!important}"
  ].join("");
  document.head.append(style);
}

/**
 * @param {HTMLElement} row - The list row that accepts drops.
 * @param {HTMLElement} handle - The dedicated draggable handle.
 * @param {string} id - Stable song key, not an array index.
 * @param {string} group - The current album or playlist namespace.
 * @param {(sourceId: string, destinationId: string) => void} onMove
 */
export function wireDragReorder(row, handle, id, group, onMove) {
  if (!row || !handle || !id || !group || typeof onMove !== "function") return;
  installStyles();
  handle.classList.add("ptg-drag-handle");
  handle.draggable = true;
  handle.title = "Drag to change song order";
  handle.setAttribute("aria-hidden", "true");

  function clearHighlight() {
    row.classList.remove("ptg-drag-row--target", "ptg-drag-row--moving");
  }

  handle.addEventListener("dragstart", event => {
    if (!event.dataTransfer) return;
    activeDrag = { id, group };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify(activeDrag));
    row.classList.add("ptg-drag-row--moving");
  });

  handle.addEventListener("dragend", () => {
    activeDrag = null;
    clearHighlight();
    document.querySelectorAll(".ptg-drag-row--target").forEach(element => {
      element.classList.remove("ptg-drag-row--target");
    });
  });

  row.addEventListener("dragover", event => {
    if (!activeDrag || activeDrag.group !== group || activeDrag.id === id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    row.classList.add("ptg-drag-row--target");
  });

  row.addEventListener("dragleave", event => {
    if (!event.relatedTarget || !row.contains(event.relatedTarget)) {
      row.classList.remove("ptg-drag-row--target");
    }
  });

  row.addEventListener("drop", event => {
    if (!activeDrag || activeDrag.group !== group) return;
    event.preventDefault();
    const sourceId = activeDrag.id;
    activeDrag = null;
    clearHighlight();
    if (sourceId !== id) onMove(sourceId, id);
  });
}
