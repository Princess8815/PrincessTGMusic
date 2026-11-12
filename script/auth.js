
import { auth } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

const container = document.getElementById("auth-container");

if (!container) {
  console.warn("Firebase Auth: #auth-container was not found.");
} else {
  container.innerHTML = `
    <div class="auth-bar">
      <span id="auth-welcome"></span>
      <div class="auth-bar-actions">
        <button id="auth-open" type="button" hidden>Login / Register</button>
        <button id="auth-logout" type="button" hidden>Log Out</button>
      </div>
    </div>

    <div id="auth-modal" class="auth-modal" hidden>
      <div class="auth-dialog" role="dialog" aria-modal="true"
           aria-labelledby="auth-heading">
        <button id="auth-close" class="auth-close"
                type="button" aria-label="Close">×</button>

        <h2 id="auth-heading">Welcome Back</h2>

        <div class="auth-tabs">
          <button id="auth-login-tab" type="button" class="active">Login</button>
          <button id="auth-register-tab" type="button">Register</button>
        </div>

        <form id="auth-form">
          <div id="auth-name-group" hidden>
            <label for="auth-name">Display Name</label>
            <input id="auth-name" type="text" maxlength="40"
                   autocomplete="nickname">
          </div>

          <label for="auth-email">Email</label>
          <input id="auth-email" type="email" required
                 autocomplete="email">

          <label for="auth-password">Password</label>
          <input id="auth-password" type="password" required
                 minlength="6" autocomplete="current-password">

          <p id="auth-message" role="status" aria-live="polite"></p>

          <button id="auth-submit" class="auth-primary" type="submit">
            Sign In
          </button>
        </form>

        <button id="auth-reset" class="auth-text-button" type="button">
          Forgot Password?
        </button>
      </div>
    </div>
  `;

  const $ = (id) => document.getElementById(id);

  const modal = $("auth-modal");
  const form = $("auth-form");
  const message = $("auth-message");
  const submit = $("auth-submit");
  const password = $("auth-password");
  const nameGroup = $("auth-name-group");
  const loginTab = $("auth-login-tab");
  const registerTab = $("auth-register-tab");

  let mode = "login";
  let busy = false;

  function setMessage(text, error = false) {
    message.textContent = text;
    message.classList.toggle("auth-error", error);
  }

  function setMode(nextMode) {
    mode = nextMode;
    form.reset();
    setMessage("");

    const registering = mode === "register";

    $("auth-heading").textContent =
      registering ? "Create Your Account" : "Welcome Back";

    submit.textContent = registering ? "Create Account" : "Sign In";
    nameGroup.hidden = !registering;
    $("auth-name").required = registering;

    password.autocomplete =
      registering ? "new-password" : "current-password";

    $("auth-reset").hidden = registering;

    loginTab.classList.toggle("active", !registering);
    registerTab.classList.toggle("active", registering);
  }

  function openModal() {
    setMode("login");
    modal.hidden = false;
    $("auth-email").focus();
  }

  function closeModal() {
    if (busy) return;
    modal.hidden = true;
    form.reset();
    setMessage("");
  }

  function friendlyError(error) {
    switch (error.code) {
      case "auth/email-already-in-use":
        return "This email already has an account.";
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/weak-password":
        return "Please choose a stronger password.";
      case "auth/invalid-credential":
        return "Incorrect email or password.";
      case "auth/too-many-requests":
        return "Too many attempts. Please try again later.";
      case "auth/network-request-failed":
        return "Network error. Please check your connection.";
      case "auth/operation-not-allowed":
        return "Email/password login is not enabled in Firebase.";
      default:
        return "Something went wrong. Please try again.";
    }
  }

  $("auth-open").addEventListener("click", openModal);
  $("auth-close").addEventListener("click", closeModal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  loginTab.addEventListener("click", () => setMode("login"));
  registerTab.addEventListener("click", () => setMode("register"));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;

    const email = $("auth-email").value.trim();
    const userPassword = password.value;
    const displayName = $("auth-name").value.trim();

    if (mode === "register" && !displayName) {
      setMessage("Please enter a display name.", true);
      return;
    }

    busy = true;
    submit.disabled = true;
    setMessage("");

    try {
      if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(
          auth, email, userPassword
        );

        try {
          await updateProfile(credential.user, { displayName });
        } catch (profileError) {
          console.error("Display name update failed:", profileError);
          setMessage(
            "Account created, but your display name could not be saved.",
            true
          );
          return;
        }
      } else {
        await signInWithEmailAndPassword(auth, email, userPassword);
      }

      modal.hidden = true;
      form.reset();
    } catch (error) {
      console.error("Authentication error:", error);
      setMessage(friendlyError(error), true);
    } finally {
      busy = false;
      submit.disabled = false;
    }
  });

  $("auth-reset").addEventListener("click", async () => {
    const email = $("auth-email").value.trim();

    if (!email) {
      setMessage("Enter your email address first.", true);
      $("auth-email").focus();
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage(
        "If an account exists for that email, a reset link will be sent."
      );
    } catch (error) {
      console.error("Password reset error:", error);
      setMessage(friendlyError(error), true);
    }
  });

  $("auth-logout").addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
      alert("Could not log out. Please try again.");
    }
  });

  onAuthStateChanged(auth, (user) => {
    const loggedIn = Boolean(user);

    $("auth-open").hidden = loggedIn;
    $("auth-logout").hidden = !loggedIn;

    $("auth-welcome").textContent = loggedIn
      ? `Welcome, ${user.displayName || user.email || "Member"}!`
      : "";

    if (loggedIn) {
      modal.hidden = true;
    }
  });
}
