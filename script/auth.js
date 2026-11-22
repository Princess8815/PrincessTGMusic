
import { auth } from "./firebase.js";
import { saveUserIfChanged } from "./user-data.js";
import {
  sendSiteVerification,refreshSiteVerification,verificationError
} from "./email-verification.js";
import {
  verifyStaff,
  watchStaffRole
} from "./staff-auth.js";
import "./song-links.js";
import "./ban-expiry.js";
import "./audio-download-controls.js";
import "./playlist-quick-add.js";
import "./site-shell.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
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
  <button id="auth-open" type="button" hidden>
    Login / Register
  </button>

  <button id="auth-admin" type="button" hidden>
    Admin Panel
  </button>

  <button id="auth-profile" type="button" hidden>
  My Profile
</button>

  <button id="auth-logout" type="button" hidden>
    Log Out
  </button>
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

        <div id="auth-google-group" class="auth-google-group">
          <div class="auth-divider"><span>or continue with</span></div>
          <button id="auth-google" class="auth-google-button" type="button">
            <span class="auth-google-mark" aria-hidden="true">G</span>
            Continue with Google
          </button>
          <p class="auth-provider-note">Google accounts can sign in without a separate site password.</p>
        </div>

        <button id="auth-reset" class="auth-text-button" type="button">
          Forgot Password?
        </button>

        <section id="auth-verify-panel" class="auth-verify-panel" hidden aria-label="Email verification">
          <p>To protect member accounts, please verify your email address before using member features.</p>
          <p class="auth-verify-address">Verification email: <strong id="auth-verify-email"></strong></p>
          <p id="auth-verify-message" role="status" aria-live="polite"></p>
          <div class="auth-verify-actions">
            <button type="button" id="auth-resend-verification" class="auth-primary">Resend verification email</button>
            <button type="button" id="auth-check-verification" class="auth-primary">I've verified my email</button>
            <button type="button" id="auth-use-another" class="auth-text-button">Use another account</button>
          </div>
        </section>
      </div>
    </div>
  `;


const profileButton = document.getElementById(
  "auth-profile"
);

if (profileButton) {
  profileButton.addEventListener("click", () => {
    window.location.href = new URL(
      "../pages/profile.html",
      import.meta.url
    ).href;
  });

  onAuthStateChanged(auth, user => {
    profileButton.hidden = !user?.emailVerified;
  });
  window.addEventListener("princesstg:email-verified",()=>{
    profileButton.hidden = !auth.currentUser?.emailVerified;
  });
}


  const $ = (id) => document.getElementById(id);

  const modal = $("auth-modal");
  const form = $("auth-form");
  const message = $("auth-message");
  const submit = $("auth-submit");
  const password = $("auth-password");
  const nameGroup = $("auth-name-group");
  const loginTab = $("auth-login-tab");
  const registerTab = $("auth-register-tab");

// ==========================================
// ADMIN PANEL BUTTON
// ==========================================

const adminButton = $("auth-admin");

// Resolve the URL from this script's location
// so it works from every page on the website.
const adminPageURL = new URL(
  "../pages/admin.html",
  import.meta.url
);

// ==========================================
// SHOW BUTTON ONLY FOR STAFF
// ==========================================

watchStaffRole((isStaff) => {
  adminButton.hidden = isStaff !== true;
});

// ==========================================
// VERIFY AGAIN BEFORE OPENING
// ==========================================

adminButton.addEventListener("click", async () => {

  adminButton.disabled = true;

  try {
    const allowed = await verifyStaff();

    if (!allowed) {
      adminButton.hidden = true;

      alert(
        "Access denied. Administrator permissions required."
      );

      return;
    }

    window.location.href = adminPageURL.href;

  } finally {
    adminButton.disabled = false;
  }
});


  let mode = "login";
  let busy = false;
  let lastVerificationEmailAt = 0;
  let lastVerificationUid = "";
  let lastAutomaticCheckAt=0;
  let automaticCheckPending=false;
  const verifyPanel = $("auth-verify-panel");
  const googleGroup = $("auth-google-group");
  const googleButton = $("auth-google");
  const googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({prompt:"select_account"});

  function setMessage(text, error = false) {
    message.textContent = text;
    message.classList.toggle("auth-error", error);
  }

  function showAuthForms() {
    verifyPanel.hidden = true;
    form.hidden = false;
    $("auth-google-group").hidden = false;
    $("auth-reset").hidden = mode === "register";
    $("auth-login-tab").parentElement.hidden = false;
  }

  function setMode(nextMode) {
    mode = nextMode;
    form.reset();
    setMessage("");
    showAuthForms();
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

  function showVerification(user, text = "") {
    if (!user || user.emailVerified) return;
    modal.hidden = false;
    form.hidden = true;
    loginTab.parentElement.hidden = true;
    googleGroup.hidden = true;
    $("auth-reset").hidden = true;
    verifyPanel.hidden = false;
    $("auth-heading").textContent = "Verify Your Email";
    $("auth-verify-email").textContent = user.email || "your email address";
    if (text) $("auth-verify-message").textContent = text;
    $("auth-open").hidden = false;
    $("auth-open").textContent = "Verify Email";
  }

  function syncAuthBar(user) {
    const loggedIn=!!user;
    const verified=!!user?.emailVerified;
    $("auth-open").hidden = loggedIn && verified;
    $("auth-open").textContent = loggedIn ? "Verify Email" : "Login / Register";
    $("auth-logout").hidden = !loggedIn;
    $("auth-welcome").textContent = loggedIn
      ? verified
        ? `Welcome, ${user.displayName || user.email || "Member"}!`
        : "Email verification required"
      : "";
    if (loggedIn && !verified) showVerification(user);
    else if (verified) {
      verifyPanel.hidden = true;
      modal.hidden = true;
    } else if (!verifyPanel.hidden) {
      // Logging out must never leave the previous account's verification
      // screen and email address visible in the modal.
      setMode("login");
      modal.hidden = true;
    }
  }

  function openModal() {
    const user = auth.currentUser;
    if (user && !user.emailVerified) {
      showVerification(user);
      return;
    }
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
    switch (error?.code) {
      case "auth/email-already-in-use":
        return "This email already has an account. Sign in instead.";
      case "auth/account-exists-with-different-credential":
        return "An account already uses this email with another sign-in method. Please sign in with that method first.";
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
        return "This sign-in method must be enabled in Firebase Authentication first.";
      case "auth/unauthorized-domain":
        return "Add this website's domain to Firebase Authentication's authorized domains.";
      case "auth/popup-blocked":
        return "Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.";
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        return "Google sign-in was cancelled.";
      case "auth/invalid-action-code":
        return "This verification link is invalid or has expired. Request a new one.";
      case "auth/unauthorized-continue-uri":
      case "auth/invalid-continue-uri":
        return "Add your website's domain under Firebase Authentication → Authorized domains.";
      case "auth/user-token-expired":
        return "Session expired. Sign in again before requesting verification.";
      default:
        return "Authentication could not be completed. Please try again.";
    }
  }

  async function sendVerification(user,automatic=false) {
    const now=Date.now();
    if(user.uid===lastVerificationUid && now-lastVerificationEmailAt<60000) {
      $("auth-verify-message").textContent =
        "A verification request was recently accepted for this account. Check your inbox and Spam folder. You can retry after 60 seconds.";
      return;
    }
    try {
      const sent=await sendSiteVerification(user);
      lastVerificationEmailAt=Date.now();
      lastVerificationUid=user.uid;
      $("auth-verify-message").textContent = sent.alreadyVerified
        ? "Your address is already verified. Select I've verified my email to continue."
        : "Firebase accepted the verification email request for "+(user.email||"your address")+
          ". Check your inbox and Spam folder. Open the verification link, then return here and select I've verified my email.";
    } catch (error) {
      console.error("Firebase verification email request failed:",error?.code,error);
      $("auth-verify-message").textContent =
        automatic
          ? "Your account was created, but Firebase rejected the verification email: "+verificationError(error)+
            ". Use Resend verification email to try again."
          : "Firebase could not send the verification email: "+verificationError(error);
    }
  }

  $("auth-open").addEventListener("click", openModal);
  $("auth-close").addEventListener("click", closeModal);
  modal.addEventListener("click", event=>{
    if(event.target===modal)closeModal();
  });
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&!modal.hidden)closeModal();
  });
  loginTab.addEventListener("click",()=>setMode("login"));
  registerTab.addEventListener("click",()=>setMode("register"));

  form.addEventListener("submit",async event=>{
    event.preventDefault();
    if(busy)return;
    const email=$("auth-email").value.trim();
    const userPassword=password.value;
    const displayName=$("auth-name").value.trim();
    if(mode==="register"&&!displayName){
      setMessage("Please enter a display name.",true);
      return;
    }
    busy=true;submit.disabled=true;setMessage("");
    try{
      if(mode==="register"){
        const credential=await createUserWithEmailAndPassword(auth,email,userPassword);
        try{
          await updateProfile(credential.user,{displayName});
        }catch(error){
          console.error("Unable to set display name:",error);
          // An optional profile-data error must never prevent sending the
          // verification email to the account that was successfully created.
          console.warn("Account created; continuing with email verification.");
        }
        showVerification(credential.user);
        // The user-data listener may have created the Firestore record
        // before updateProfile completed. Save the final display name.
        void saveUserIfChanged().catch(error=>{
          console.warn("New account profile sync deferred:",error);
        });
        await sendVerification(credential.user,true);
      }else{
        const credential=await signInWithEmailAndPassword(auth,email,userPassword);
        const verified=await refreshSiteVerification(credential.user);
        if(verified)modal.hidden=true;
        else showVerification(credential.user,
          "Your address is still unverified. Open the email link to confirm it, then come back here.");
      }
      syncAuthBar(auth.currentUser);
    }catch(error){
      console.error("Authentication error:",error);
      setMessage(friendlyError(error),true);
    }finally{busy=false;submit.disabled=false;}
  });

  googleButton.addEventListener("click",async()=>{
    if(busy)return;
    busy=true;googleButton.disabled=true;setMessage("");
    try{
      // Popup is opened directly from the click handler. Redirect sign-in
      // is deliberately avoided on third-party GitHub Pages hosting.
      const credential=await signInWithPopup(auth,googleProvider);
      await credential.user.getIdToken(true);
      if(credential.user.emailVerified){
        modal.hidden=true;
        window.dispatchEvent(new CustomEvent("princesstg:email-verified"));
      }else{
        showVerification(credential.user,
          "Google hasn't confirmed this email as verified yet. Verify it to continue.");
      }
      syncAuthBar(credential.user);
    }catch(error){
      console.error("Google sign-in error:",error);
      setMessage(friendlyError(error),true);
    }finally{busy=false;googleButton.disabled=false;}
  });

  $("auth-resend-verification").addEventListener("click",async()=>{
    const user=auth.currentUser;
    if(!user || user.emailVerified)return;
    const button=$("auth-resend-verification");
    button.disabled=true;
    try{await sendVerification(user);}
    finally{button.disabled=false;}
  });

  $("auth-check-verification").addEventListener("click",async()=>{
    const user=auth.currentUser;
    if(!user)return;
    const button=$("auth-check-verification");
    button.disabled=true;
    $("auth-verify-message").textContent="Checking verification...";
    try{
      const verified=await refreshSiteVerification(user);
      if(!verified){
        $("auth-verify-message").textContent =
          "Firebase still shows this address as unverified. Open the link, press Verify on Firebase's page, then try again.";
        return;
      }
      verifyPanel.hidden=true;
      modal.hidden=true;
      syncAuthBar(user);
      try { await saveUserIfChanged(); }
      catch (error) { console.warn("Verified status sync deferred:",error); }
    }catch(error){
      $("auth-verify-message").textContent =
        "Could not check verification: "+verificationError(error);
    }finally{button.disabled=false;}
  });

  $("auth-use-another").addEventListener("click",async()=>{
    if(busy)return;
    busy=true;
    try{
      await signOut(auth);
      setMode("login");
      modal.hidden=false;
    }catch(error){
      $("auth-verify-message").textContent="Could not change account: "+friendlyError(error);
    }finally{busy=false;}
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
    // Save any unsaved user changes.
    try {
      await saveUserIfChanged();
    } catch (saveError) {
      console.warn(
        "User changes could not be saved:",
        saveError
      );
    }

    await signOut(auth);

  } catch (error) {
    console.error("Logout failed:", error);
    alert("Could not log out. Please try again.");
  }
});


  // Firebase's default email handler verifies the address in another tab.
  // Refresh automatically when the member returns instead of forcing them
  // to know which button to click. Throttle to avoid repeated auth requests.
  async function refreshOnReturn(){
    const user=auth.currentUser;
    if(!user||user.emailVerified||automaticCheckPending)return;
    if(Date.now()-lastAutomaticCheckAt<8000)return;
    lastAutomaticCheckAt=Date.now();
    automaticCheckPending=true;
    try{
      if(await refreshSiteVerification(user)){
        syncAuthBar(user);
        try {await saveUserIfChanged();}
        catch(error){console.warn("Verified profile sync deferred:",error);}
      }
    }catch(error){
      console.warn("Email verification refresh failed:",error);
      if(!verifyPanel.hidden)
        $("auth-verify-message").textContent =
          "Verification status could not refresh: "+verificationError(error);
    }finally{automaticCheckPending=false;}
  }
  window.addEventListener("focus",()=>void refreshOnReturn());
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible")void refreshOnReturn();
  });
  onAuthStateChanged(auth,user=>{
    syncAuthBar(user);
    if(user&&!user.emailVerified)void refreshOnReturn();
  });
}
