
const GENRES = [
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

    GENRES.forEach(genre => {
      if (existingValues.has(genre)) return;

      const option = document.createElement("option");
      option.value = genre;
      option.textContent = genre;

      select.appendChild(option);
    });
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
