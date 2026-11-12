
const poemGrid = document.getElementById("poem-grid");
const poemCount = document.getElementById("poem-count");

const poemReader = document.getElementById("poem-reader");
const poetryLibrary = document.getElementById("poetry-library");
const poetryHeading = document.getElementById("poetry-heading");
const poetryNavigation = document.getElementById("poetry-navigation");

const readerTitle = document.getElementById("reader-title");
const readerRating = document.getElementById("reader-rating");
const readerContent = document.getElementById("reader-content");
const closePoem = document.getElementById("close-poem");

let allPoems = [];

// Load poems from JSON
async function loadPoems() {
  try {
    const response = await fetch("../data/poems.json");

    if (!response.ok) {
      throw new Error("Unable to load poetry JSON");
    }

    const data = await response.json();

    if (!Array.isArray(data.poems)) {
      throw new Error("Invalid poetry JSON structure");
    }

    allPoems = data.poems;

    poemCount.textContent =
      `${allPoems.length} poems available`;

    displayPoems(allPoems);
    showRequestedPoem();

  } catch (error) {
    console.error("Poetry loading error:", error);
    poemGrid.textContent = "Unable to load poems.";
  }
}

// Generate clickable cards
function displayPoems(poems) {
  poemGrid.replaceChildren();

  poems.forEach((poem) => {
    const card = document.createElement("button");

    card.type = "button";
    card.className = "poem-card";

    const title = document.createElement("h3");
    title.textContent = poem.title;

    const rating = document.createElement("div");
    rating.className = "poem-rating";
    rating.textContent = "☆☆☆☆☆";

    const ratingText = document.createElement("span");
    ratingText.className = "poem-rating-text";
    ratingText.textContent = "Not yet rated";

    card.append(title, rating, ratingText);

    card.addEventListener("click", () => {
      openPoem(poem.slug);
    });

    poemGrid.appendChild(card);
  });
}

// Display one poem and hide the listing
function showPoemView(poem) {
  readerTitle.textContent = poem.title;
  readerRating.textContent = "☆☆☆☆☆  Not yet rated";
  readerContent.textContent = poem.content || "";

  poetryHeading.hidden = true;
  poetryNavigation.hidden = true;
  poetryLibrary.hidden = true;

  poemReader.hidden = false;

  window.scrollTo({ top: 0, behavior: "instant" });
}

// Restore the poetry homepage
function showLibraryView() {
  poemReader.hidden = true;

  poetryHeading.hidden = false;
  poetryNavigation.hidden = false;
  poetryLibrary.hidden = false;

  window.scrollTo({ top: 0, behavior: "instant" });
}

// Open a selected poem
function openPoem(slug) {
  const poem = allPoems.find(
    (item) => item.slug === slug
  );

  if (!poem) return;

  const url = new URL(window.location.href);
  url.searchParams.set("poem", slug);

  history.pushState({ poem: slug }, "", url);

  showPoemView(poem);
}

// Back to poetry collection
function returnToLibrary() {
  const url = new URL(window.location.href);
  url.searchParams.delete("poem");

  history.pushState({}, "", url);

  showLibraryView();
}

// Support direct links and browser navigation
function showRequestedPoem() {
  const slug = new URLSearchParams(
    window.location.search
  ).get("poem");

  const poem = allPoems.find(
    (item) => item.slug === slug
  );

  if (poem) {
    showPoemView(poem);
  } else {
    showLibraryView();
  }
}

closePoem.addEventListener("click", returnToLibrary);

window.addEventListener("popstate", showRequestedPoem);

loadPoems();
