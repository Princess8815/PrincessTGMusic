
// ==========================================
// CASH APP
// ==========================================

const CASH_APP = "$TransGirl777";

document.querySelectorAll(".cashapp-name")
  .forEach(element => {
    element.textContent = CASH_APP;
  });

// ==========================================
// GENRE DROPDOWNS
// ==========================================

const genreSelects = Array.from(
  document.querySelectorAll(".genre-select")
);

// ==========================================
// PAYMENT CODE GENERATOR
// ==========================================

const storageKey = "princesstg-song-challenge";

function generateCode() {
  const numbers = new Uint32Array(1);
  crypto.getRandomValues(numbers);

  return String(1000 + (numbers[0] % 9000));
}

function saveEntry(entry) {
  sessionStorage.setItem(
    storageKey,
    JSON.stringify(entry)
  );
}

function loadEntry() {
  try {
    return JSON.parse(
      sessionStorage.getItem(storageKey)
    );
  } catch {
    return null;
  }
}

let entry = loadEntry();

if (!entry || !/^[0-9]{4}$/.test(entry.code)) {
  entry = {
    code: generateCode(),
    submitted: false
  };

  saveEntry(entry);
}

// ==========================================
// PAGE ELEMENTS
// ==========================================

const form = document.getElementById("songwriter-form");

const formSection = document.getElementById(
  "form-section"
);

const confirmation = document.getElementById(
  "payment-confirmation"
);

const paymentInput = document.getElementById(
  "payment-code-input"
);

const displayCode = document.getElementById(
  "display-payment-code"
);

const submitButton = document.getElementById(
  "submit-button"
);

const submitError = document.getElementById(
  "submit-error"
);

const genreError = document.getElementById(
  "genre-error"
);

// ==========================================
// SHOW CURRENT ENTRY
// ==========================================

function showCurrentEntry() {
  paymentInput.value = entry.code;
  displayCode.textContent = entry.code;

  formSection.hidden = entry.submitted;
  confirmation.hidden = !entry.submitted;
}

showCurrentEntry();

// ==========================================
// SUBMIT FORM TO FORMSPREE
// ==========================================

form.addEventListener("submit", async function(event) {
  event.preventDefault();

  submitError.hidden = true;
  genreError.hidden = true;

  // Reject duplicate genres.

  const selectedGenres = genreSelects
    .map(select => select.value)
    .filter(Boolean);

  const uniqueGenres = new Set(selectedGenres);

  if (uniqueGenres.size !== selectedGenres.length) {
    genreError.hidden = false;

    genreError.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    return;
  }

  // Include verification code.

  paymentInput.value = entry.code;

  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";

  try {
    const response = await fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      headers: {
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error("Form submission failed");
    }

    // Mark entry as submitted.

    entry.submitted = true;
    saveEntry(entry);

    // Display payment instructions.

    showCurrentEntry();

    confirmation.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  } catch (error) {
    submitError.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit My Song Challenge";
  }
});

// ==========================================
// START A NEW ENTRY
// ==========================================

document.getElementById("new-entry-button")
  .addEventListener("click", function() {
    entry = {
      code: generateCode(),
      submitted: false
    };

    saveEntry(entry);
    form.reset();
    showCurrentEntry();

    formSection.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });
