import {publicError,withErrorCode} from "./site-errors.js";

document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  // ==========================================
  // SETTINGS
  // ==========================================

  const CASH_APP = "$TransGirl777";

  // ==========================================
  // FIND FORM
  // ==========================================

  const form = document.querySelector(
    "#songwriter-form, #challenge-form"
  );

  if (!form) {
    console.error("Challenge form not found.");
    return;
  }

  console.log("Challenge form initialized:", form.id);

  const formSection = document.getElementById("form-section");
  const paymentInput = form.querySelector("#payment-code-input");
  const submitButton = form.querySelector("#submit-button");
  const submitError = form.querySelector("#submit-error");
  const genreError = form.querySelector("#genre-error");

  const genreSelects = [
    ...form.querySelectorAll(".genre-select")
  ];

  const challengeSelect = form.querySelector("#challenge-select");

  if (!formSection || !paymentInput || !submitButton || !submitError) {
    console.error("Missing required challenge form elements.");
    return;
  }

  // ==========================================
  // PRICE AND FORM CONFIGURATION
  // ==========================================

  const amount = Number(form.dataset.price);

  if (!Number.isFinite(amount) || amount <= 0) {
    console.error("Invalid data-price on form.");
    return;
  }

  const price = Number.isInteger(amount)
    ? `$${amount}`
    : `$${amount.toFixed(2)}`;

  const storageKey = form.dataset.storageKey ||
    `princesstg-${form.id}`;

  const endpoint = form.action;

  if (!endpoint.startsWith("https://formspree.io/f/")) {
    console.error("Invalid Formspree endpoint:", endpoint);
    return;
  }

  console.log("Form endpoint:", endpoint);

  // ==========================================
  // POPULATE CHALLENGE DROPDOWN
  // ==========================================

  if (challengeSelect) {
    document.querySelectorAll(
      ".challenge-card[data-challenge] h2"
    ).forEach(heading => {
      const label = heading.textContent.trim();

      const exists = [...challengeSelect.options]
        .some(option => option.value === label);

      if (exists) return;

      const option = document.createElement("option");

      option.value = label;
      option.textContent = label;

      challengeSelect.appendChild(option);
    });
  }

  // ==========================================
  // GENERATE CONFIRMATION PAGE
  // ==========================================

  const confirmation = document.createElement("section");

  confirmation.id = "payment-confirmation";
  confirmation.className = "intro-card";
  confirmation.hidden = true;
  confirmation.setAttribute("aria-live", "polite");

  confirmation.innerHTML = `
    <h2>🎵 Your Challenge Has Been Submitted!</h2>

    <p>
      Your answers have been received successfully.
    </p>

    <div id="selected-challenge-row" hidden>
      <h3>Your Selected Challenge</h3>
      <p id="selected-challenge-display"></p>
    </div>

    <h3>Your Four-Digit Payment Code</h3>

    <p
      class="payment-code"
      id="display-payment-code"
    ></p>

    <p>
      <strong>
        PLEASE SEND AT LEAST
        <span class="challenge-price"></span>
        THROUGH CASH APP TO:
      </strong>
    </p>

    <h2 class="cashapp-name"></h2>

    <p>
      <strong>
        IMPORTANT: Include your four-digit code
        in your Cash App payment note!
      </strong>
    </p>

    <p>
      This code helps match your Cash App
      payment to your challenge submission.
    </p>

    <p>
      Your song will be created after
      your payment has been verified.
    </p>

    <p>
      <strong>
        Save your code until your payment
        has been verified.
      </strong>
    </p>

    <div class="confirmation-actions">
      <a
        id="payment-back-button"
        class="back-button"
      ></a>

      <button
        type="button"
        id="new-entry-button"
        class="new-entry-button"
      >
        Start Another Submission
      </button>
    </div>
  `;

  formSection.insertAdjacentElement(
    "afterend",
    confirmation
  );

  // ==========================================
  // BACK BUTTON
  // ==========================================

  const backButton = confirmation.querySelector(
    "#payment-back-button"
  );

  backButton.href = form.dataset.backUrl || "../index.html";

  backButton.textContent =
    `← ${form.dataset.backLabel || "Back to Music"}`;

  // ==========================================
  // DISPLAY PAYMENT DETAILS
  // ==========================================

  document.querySelectorAll(".cashapp-name")
    .forEach(element => {
      element.textContent = CASH_APP;
    });

  document.querySelectorAll(".challenge-price")
    .forEach(element => {
      element.textContent = price;
    });

  // ==========================================
  // GENERATE RANDOM FOUR-DIGIT CODE
  // ==========================================

  function generateCode() {
    const numbers = new Uint32Array(1);

    crypto.getRandomValues(numbers);

    return String(1000 + (numbers[0] % 9000));
  }

  function newEntry() {
    return {
      code: generateCode(),
      submitted: false,
      challenge: ""
    };
  }

  // ==========================================
  // SESSION STORAGE
  // ==========================================

  function saveEntry(value) {
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify(value)
      );
    } catch (error) {
      console.warn("Could not save entry:", error);
    }
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

  if (
    !entry ||
    typeof entry.code !== "string" ||
    !/^[0-9]{4}$/.test(entry.code)
  ) {
    entry = newEntry();
    saveEntry(entry);
  }

  // ==========================================
  // SHOW FORM OR CONFIRMATION
  // ==========================================

  function showCurrentEntry() {
    paymentInput.value = entry.code;

    confirmation.querySelector(
      "#display-payment-code"
    ).textContent = entry.code;

    const challengeRow = confirmation.querySelector(
      "#selected-challenge-row"
    );

    const challengeDisplay = confirmation.querySelector(
      "#selected-challenge-display"
    );

    challengeDisplay.textContent = entry.challenge || "";

    challengeRow.hidden = !entry.challenge;

    formSection.hidden = Boolean(entry.submitted);
    confirmation.hidden = !entry.submitted;
  }

  showCurrentEntry();

  // ==========================================
  // ERROR DISPLAY
  // ==========================================

  function showError(message) {
    console.error("Challenge submission error:", message);

    submitError.textContent=withErrorCode(message,"PTG-701");
    submitError.hidden = false;

    submitError.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  function clearErrors() {
    submitError.hidden = true;
    submitError.textContent = "";

    if (genreError) {
      genreError.hidden = true;
    }
  }

  // ==========================================
  // VALIDATION ERROR DETECTION
  // ==========================================

  form.addEventListener("invalid", event => {
    const field = event.target;

    console.warn(
      "Invalid form field:",
      field.name,
      field.validationMessage
    );

    submitError.textContent =
      withErrorCode("Check the required fields.","PTG-007");

    submitError.hidden = false;
  }, true);

  // ==========================================
  // VALIDATE GENRES
  // ==========================================

  function validateGenres() {
    const selectedGenres = genreSelects
      .map(select => select.value.trim())
      .filter(Boolean);

    const uniqueGenres = new Set(selectedGenres);

    if (uniqueGenres.size !== selectedGenres.length) {
      if (genreError) {
        genreError.hidden = false;

        genreError.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      }

      showError(
        "You cannot select the same genre more than once."
      );

      return false;
    }

    return true;
  }

  // ==========================================
  // PARSE FORMSPREE RESPONSE
  // ==========================================

  async function parseResponse(response) {
    const responseText = await response.text();

    let result = null;

    try {
      result = JSON.parse(responseText);
    } catch {
      console.warn(
        "Formspree returned a non-JSON response:",
        responseText.slice(0, 500)
      );
    }

    if (!response.ok || result?.ok === false) {
      let message =
        `Formspree rejected the submission (HTTP ${response.status}).`;

      if (Array.isArray(result?.errors)) {
        const messages = result.errors
          .map(error => publicError(error,"PTG-701"))
          .filter(Boolean);

        if (messages.length > 0) {
          message = messages.join(" ");
        }
      } else if (typeof result?.error === "string") {
        message = result.error;
      } else if (typeof result?.message === "string") {
        message = result.message;
      }

      throw new Error(message);
    }

    if (!result) {
      throw new Error(
        "Formspree returned an unexpected response. " +
        "Check its dashboard before submitting again."
      );
    }

    return result;
  }

  // ==========================================
  // SUBMIT TO FORMSPREE
  // ==========================================

  form.addEventListener("submit", async event => {
    event.preventDefault();

    console.log("Submit event triggered.");

    // Already submitted in this session.
    if (entry.submitted) {
      console.warn("This entry was already submitted.");
      showCurrentEntry();
      return;
    }

    clearErrors();

    // ========================================
    // VALIDATE FORM
    // ========================================

    if (!form.checkValidity()) {
      form.reportValidity();

      showError(
        "Please complete all required fields before submitting."
      );

      return;
    }

    if (!validateGenres()) {
      return;
    }

    // ========================================
    // PREPARE SUBMISSION
    // ========================================

    paymentInput.value = entry.code;

    const originalButtonText = submitButton.textContent;

    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";

    try {
      const formData = new FormData(form);

      // Ensure verification code is included.
      formData.set(
        "Payment Verification Code",
        entry.code
      );

      // Include required payment amount.
      formData.set(
        "Minimum Payment",
        price
      );

      // Include challenge when applicable.
      if (challengeSelect) {
        formData.set(
          "Selected Challenge",
          challengeSelect.value
        );
      }

      console.log("Sending submission to Formspree...");
      console.log("Endpoint:", endpoint);
      console.log("Number of fields:", [...formData.keys()].length);

      // ======================================
      // SEND FORM
      // ======================================

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
        headers: {
          "Accept": "application/json"
        }
      });

      console.log("HTTP status:", response.status);

      // ======================================
      // CHECK RESPONSE
      // ======================================

      const result = await parseResponse(response);

      console.log("Formspree accepted submission:", result);

      // ======================================
      // RECORD SUCCESS
      // ======================================

      entry.challenge = challengeSelect
        ? challengeSelect.value
        : "";

      entry.submitted = true;

      saveEntry(entry);

      // ======================================
      // SHOW CONFIRMATION
      // ======================================

      showCurrentEntry();

      confirmation.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

    } catch (error) {
      console.error("Form submission failed:", error);

      showError(publicError(error,"PTG-701"));

    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
    }
  });

  // ==========================================
  // START ANOTHER SUBMISSION
  // ==========================================

  confirmation.querySelector(
    "#new-entry-button"
  ).addEventListener("click", () => {
    entry = newEntry();

    saveEntry(entry);

    form.reset();

    clearErrors();

    showCurrentEntry();

    formSection.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  // ==========================================
  // INITIALIZATION COMPLETE
  // ==========================================

  console.log("Challenge form ready.");
});
