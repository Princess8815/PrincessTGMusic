import {publicError,withErrorCode} from "./site-errors.js";
import {claimPendingAxolotls,discoverAxolotl} from "./reef-collection.js";

import { auth } from "./firebase.js";
import { saveUserIfChanged } from "./user-data.js";
import {hasSiteVerificationAccess,refreshSiteVerificationAccess} from "./verification-access.js";
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
    profileButton.hidden = !hasSiteVerificationAccess(user);
  });
  window.addEventListener("princesstg:email-verified",()=>{
    profileButton.hidden = !hasSiteVerificationAccess(auth.currentUser);
  });
}


  window.addEventListener("princesstg:verification-access-changed",()=>{
    if(profileButton)profileButton.hidden=!hasSiteVerificationAccess(auth.currentUser);
  });

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
        publicError(null,"PTG-003")
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
    message.textContent=error?withErrorCode(text,"PTG-101"):text;
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
    if (!user || hasSiteVerificationAccess(user)) return;
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
    const verified=hasSiteVerificationAccess(user);
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
    if (user && !hasSiteVerificationAccess(user)) {
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
    return publicError(error,"PTG-101");
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
      if(auth.currentUser?.uid!==user.uid)return;
      lastVerificationEmailAt=Date.now();
      lastVerificationUid=user.uid;
      $("auth-verify-message").textContent = sent.alreadyVerified
        ? "This account is already verified. Select I've verified my email to continue."
        : "Verification email requested. Check your inbox and spam folder.";
    } catch (error) {
      console.error("Firebase verification request rejected:",error?.code||"unknown",error);
      if(auth.currentUser?.uid!==user.uid)return;
      $("auth-verify-message").textContent =
        verificationError(error);
    }
  }

  $("auth-open").addEventListener("click", openModal);
  const reefParams=new URLSearchParams(location.search);
  const reefMode=reefParams.get("reefSignIn");
  if((reefMode==="login"||reefMode==="register")&&reefParams.get("reefEncounter")==="nori")discoverAxolotl("nori");
  if(reefMode==="login"||reefMode==="register")void auth.authStateReady().then(()=>{
    if(!auth.currentUser){openModal();if(reefMode==="register")setMode("register");}
    const clean=new URL(location.href);clean.searchParams.delete("reefSignIn");clean.searchParams.delete("reefEncounter");history.replaceState(null,"",clean.href);
  });
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
        void claimPendingAxolotls(credential.user);
        // Request verification FIRST. A slow/denied Firestore profile write
        // or display-name update must never delay the new user's email.
        showVerification(credential.user,
          "Requesting your verification email for "+(credential.user.email||"this account")+"...");
        await sendVerification(credential.user,true);
        // Profile metadata is optional for Firebase Auth verification.
        try{
          await updateProfile(credential.user,{displayName});
        }catch(error){
          console.error("Display name update failed after verification request:",error);
        }
        // The Firestore user record can initialize before updateProfile.
        // Sync the completed display name without blocking the Auth email.
        void saveUserIfChanged().catch(error=>{
          console.warn("New account profile sync deferred:",error);
        });
      }else{
        const credential=await signInWithEmailAndPassword(auth,email,userPassword);
        void claimPendingAxolotls(credential.user);
        const verified=await refreshSiteVerificationAccess(credential.user)
          || await refreshSiteVerification(credential.user);
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
        void claimPendingAxolotls(credential.user);
      await credential.user.getIdToken(true);
      if(credential.user.emailVerified || await refreshSiteVerificationAccess(credential.user)){
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
          publicError(null,"PTG-109");
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
    alert(publicError(error,"PTG-101"));
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
  // On navigation Firebase Auth restores the user BEFORE the Firestore
  // owner-bypass record is available. Resolve the server-side exception
  // first, so approved members never see a flashing "Verify Your Email".
  let authDisplayVersion=0;
  let activeAccessCheckUid="";
  onAuthStateChanged(auth,user=>{
    const version=++authDisplayVersion;
    activeAccessCheckUid="";
    if(!user){
      syncAuthBar(null);
      return;
    }
    if(user.emailVerified){
      activeAccessCheckUid=user.uid;
      syncAuthBar(user);
      return;
    }
    // While loading, hide the verification action and don't open the modal.
    $("auth-open").hidden=true;
    $("auth-welcome").textContent="Checking account access...";
    activeAccessCheckUid="";
    void (async()=>{
      try{
        await refreshSiteVerificationAccess(user);
      }catch(error){
        console.warn("Initial site access check failed:",error);
      }
      if(version!==authDisplayVersion||auth.currentUser?.uid!==user.uid)return;
      activeAccessCheckUid=user.uid;
      syncAuthBar(user);
      if(!user.emailVerified)void refreshOnReturn();
    })();
  });
  window.addEventListener("princesstg:verification-access-changed",event=>{
    if(event.detail?.uid!==auth.currentUser?.uid)return;
    // A Firestore listener can resolve while the initial Auth callback is
    // pending. Only render after the first access check has finished.
    if(activeAccessCheckUid!==event.detail.uid)return;
    syncAuthBar(auth.currentUser);
  });
}
