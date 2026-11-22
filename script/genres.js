
let GENRES = [
  "Pop",
  "Pop Rock",
  "Emotional Pop Rock",
  "Power Pop",
  "Soft Rock",
  "Alternative Rock",
  "Hard Rock",
  "Classic Rock",
  "Dark Rock",
  "Pop Metal",
  "Heavy Metal",
  "Speed Metal",
  "Alternative Metal",
  "Heavy Alternative Metal",
  "Melodic Metal",
  "Modern Melodic Metal",
  "Power Metal",
  "Symphonic Metal",
  "Gothic Metal",
  "Industrial Metal",
  "Industrial Alternative Metal",
  "Industrial Nu Metal",
  "Electronic Metal",
  "Progressive Metal",
  "Djent",
  "Industrial Djent",
  "Progressive Djent Metal",
  "Progressive Groove Metal",
  "Metalcore",
  "Melodic Metalcore",
  "Hardcore Metal",
  "Mathcore",
  "Black Metal",
  "Melodic Death Metal",
  "Extreme Progressive Metal"
];

// Make genres available to every script.
window.PrincessTGGenres = GENRES;

// Automatically populate genre dropdowns.
function populatePrincessTGGenres(root = document) {
  const selects = root.querySelectorAll(".genre-select");

  selects.forEach(select => {
    const existingValues = new Set(
      Array.from(select.options, option => option.value)
    );

    // Keep placeholder/current selection, but replace stale managed choices.
    const previous = select.value;
    for (const option of [...select.options]) {
      if (option.value && option.dataset.fromGenres === "1") option.remove();
    }
    const available = new Set([...select.options].map(option => option.value));
    GENRES.forEach(genre => {
      if (available.has(genre)) return;
      const option = new Option(genre, genre);
      option.dataset.fromGenres = "1";
      select.add(option);
    });
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
  });
}

window.populatePrincessTGGenres = populatePrincessTGGenres;

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    () => populatePrincessTGGenres(),
    { once: true }
  );
} else {
  populatePrincessTGGenres();
}

// Prefer the Firestore list when available, retain the built-in
// fallback for older sites and when Firestore is unavailable.
(async () => {
  try {
    const [{db}, {doc, getDoc}] = await Promise.all([
      import("./firebase.js"),
      import("https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js")
    ]);
    const snapshot = await getDoc(doc(db, "enums", "genres"));
    const stored = snapshot.exists() ? snapshot.data().values : null;
    if (!Array.isArray(stored)) return;
    GENRES = stored.filter(value => typeof value === "string" && value.trim());
    window.PrincessTGGenres = GENRES;
    populatePrincessTGGenres();
    window.dispatchEvent(new CustomEvent("princesstg:genres-updated"));
  } catch (error) {
    console.warn("Using built-in genre list:", error);
  }
})();
window.addEventListener("princesstg:genres-updated", event => {
  if (Array.isArray(event.detail)) GENRES = event.detail;
  window.PrincessTGGenres = GENRES;
  populatePrincessTGGenres();
});
