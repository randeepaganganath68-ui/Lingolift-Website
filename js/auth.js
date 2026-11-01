"use strict";

const authForm = document.querySelector("[data-auth-form]");

if (authForm) {
  const authPage = authForm.dataset.authForm;
  const authStatus = document.querySelector("#auth-status");
  const authFieldset = authForm.querySelector("fieldset");
  const submitButton = authForm.querySelector('button[type="submit"]');
  const defaultSubmitLabel = submitButton.textContent.trim();
  let supabaseClient;
  let formReady = false;
  let requestInProgress = false;
  let recoverySessionDetected = false;

  function setStatus(message, state = "info") {
    authStatus.textContent = message;
    authStatus.dataset.state = state;
  }

  function setFormReady(ready) {
    formReady = ready;
    authFieldset.disabled = !ready;
    submitButton.disabled = !ready;
  }

  function setBusy(busy, label = defaultSubmitLabel) {
    requestInProgress = busy;
    authFieldset.disabled = busy || !formReady;
    submitButton.textContent = label;
    submitButton.disabled = busy || !formReady;
    authForm.setAttribute("aria-busy", String(busy));
  }

  function siteUrl(page) {
    const homeLink = document.querySelector(".auth-header .brand");
    const homeUrl = new URL(homeLink.getAttribute("href"), window.location.href);
    const targetUrl = new URL(page, homeUrl);
    if (targetUrl.origin !== window.location.origin) {
      throw new Error("Authentication redirects must stay on this website.");
    }
    return targetUrl.href;
  }

  function removeAuthCallbackParameters() {
    const currentUrl = new URL(window.location.href);
    const containsAuthData =
      currentUrl.searchParams.has("code") ||
      /(?:access_token|refresh_token|error_description)=/.test(currentUrl.hash);
    if (!containsAuthData) return;

    const cleanUrl = new URL(currentUrl.pathname, currentUrl.origin);
    if (currentUrl.searchParams.get("confirmed") === "1") {
      cleanUrl.searchParams.set("confirmed", "1");
    }
    history.replaceState(history.state, "", cleanUrl.href);
  }

  function authErrorMessage(error, action) {
    const code = error && typeof error.code === "string" ? error.code : "";
    if (code === "invalid_credentials" || code === "email_not_confirmed") {
      return "Those sign-in details could not be verified. Check your email and password, and verify your email if you just registered.";
    }
    if (code === "weak_password") {
      return "Choose a stronger password and try again.";
    }
    if (code === "same_password") {
      return "Choose a password different from your current password.";
    }
    if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") {
      return "Too many requests were made. Please wait a little while and try again.";
    }
    if (code === "otp_expired" || code === "token_expired" || code === "access_denied") {
      return "This link is invalid or has expired. Request a new email and try again.";
    }
    if (action === "login") {
      return "We couldn't log you in. Check your details and try again.";
    }
    if (action === "signup") {
      return "We couldn't create your account. Check your details and try again.";
    }
    if (action === "forgot") {
      return "We couldn't request a reset email right now. Please try again later.";
    }
    return "We couldn't update your password. Request a new reset email and try again.";
  }

  function addPasswordVisibilityToggles() {
    authForm.querySelectorAll("[data-toggle-password]").forEach((toggle) => {
      toggle.addEventListener("click", () => {
        const passwordInput = document.getElementById(toggle.getAttribute("aria-controls"));
        if (!(passwordInput instanceof HTMLInputElement)) return;
        const shouldShow = passwordInput.type === "password";
        passwordInput.type = shouldShow ? "text" : "password";
        toggle.textContent = shouldShow ? "Hide" : "Show";
        toggle.setAttribute("aria-pressed", String(shouldShow));
        toggle.setAttribute("aria-label", `${shouldShow ? "Hide" : "Show"} password`);
      });
    });
  }

  function updatePasswordMatch() {
    const password = authForm.elements.namedItem("password");
    const confirmation = authForm.elements.namedItem("confirmPassword");
    if (!(password instanceof HTMLInputElement) || !(confirmation instanceof HTMLInputElement)) return;
    confirmation.setCustomValidity(
      confirmation.value && confirmation.value !== password.value
        ? "Passwords do not match."
        : "",
    );
  }

  async function submitAuthForm(event) {
    event.preventDefault();
    if (authPage === "signup" || authPage === "reset") updatePasswordMatch();
    if (requestInProgress || !formReady || !authForm.reportValidity()) return;

    const emailInput = authForm.elements.namedItem("email");
    const email = emailInput instanceof HTMLInputElement ? emailInput.value.trim() : "";
    const passwordInput = authForm.elements.namedItem("password");
    const password = passwordInput instanceof HTMLInputElement ? passwordInput.value : "";

    const actionLabels = {
      signup: "Creating account…",
      login: "Logging in…",
      forgot: "Sending request…",
      reset: "Updating password…",
    };

    setBusy(true, actionLabels[authPage]);
    try {
      if (authPage === "signup") {
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: siteUrl("login.html?confirmed=1") },
        });
        if (error) {
          setStatus(authErrorMessage(error, "signup"), "error");
        } else if (data.session) {
          const { error: signOutError } = await supabaseClient.auth.signOut();
          setStatus(
            signOutError
              ? "Supabase returned a signed-in session before email verification, and this browser could not clear it. Enable email confirmation in Supabase Auth settings before accepting registrations."
              : "Supabase returned a signed-in session before email verification. This browser session was cleared. Enable email confirmation in Supabase Auth settings before accepting registrations.",
            "error",
          );
        } else {
          setStatus(
            "If registration was accepted, check your inbox for a verification link. You must verify your email before logging in.",
            "success",
          );
          authForm.reset();
        }
      } else if (authPage === "login") {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
          setStatus(authErrorMessage(error, "login"), "error");
        } else {
          setStatus("You are logged in. Redirecting to Lingolift…", "success");
          window.setTimeout(() => window.location.replace(siteUrl("index.html")), 400);
        }
      } else if (authPage === "forgot") {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
          redirectTo: siteUrl("reset-password.html"),
        });
        if (error) {
          setStatus(authErrorMessage(error, "forgot"), "error");
        } else {
          setStatus(
            "If an account exists for that email, a password reset link will arrive shortly.",
            "success",
          );
          authForm.reset();
        }
      } else if (authPage === "reset") {
        const { error } = await supabaseClient.auth.updateUser({ password });
        if (error) {
          setStatus(authErrorMessage(error, "reset"), "error");
        } else {
          setStatus("Your password has been updated. You can continue to Lingolift.", "success");
          authForm.reset();
        }
      }
    } catch {
      setStatus("Lingolift account services could not complete that request. Check your connection and try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function initializeAuth() {
    addPasswordVisibilityToggles();
    if (authPage === "signup" || authPage === "reset") {
      authForm.addEventListener("input", updatePasswordMatch);
    }
    authForm.addEventListener("submit", submitAuthForm);

    try {
      const { supabase } = await import("./supabase-client.js");
      if (!supabase) {
        setStatus("Account services are not configured. Please contact the Lingolift website owner.", "error");
        return;
      }
      supabaseClient = supabase;
      if (authPage === "reset") {
        supabaseClient.auth.onAuthStateChange((event, session) => {
          if (event === "PASSWORD_RECOVERY" && session) {
            recoverySessionDetected = true;
            setFormReady(true);
            setStatus("Choose a new password for your account.", "info");
          }
        });
      }
      const confirmationComplete = new URLSearchParams(window.location.search).get("confirmed") === "1";
      const { data, error } = await supabaseClient.auth.getSession();
      removeAuthCallbackParameters();
      if (error) {
        setStatus("We couldn't check your account session. Refresh the page and try again.", "error");
        return;
      }

      if (authPage === "reset") {
        if (!data.session || !recoverySessionDetected) {
          setStatus("This reset link is invalid or expired. Request a new password reset email to continue.", "error");
          return;
        }
        setFormReady(true);
        setStatus("Choose a new password for your account.", "info");
      } else {
        setFormReady(true);
        if (confirmationComplete) {
          setStatus(
            data.session
              ? "Your email has been verified and your session is active. Continue to Lingolift from the home page."
              : "Your email has been verified. You can now log in.",
            "success",
          );
        } else if (authPage === "login" && data.session) {
          setStatus("You are already logged in. Continue to Lingolift from the home page.", "info");
        } else if (authPage === "signup") {
          setStatus("Create an account with your email. Email verification is required before login.", "info");
        } else if (authPage === "forgot") {
          setStatus("Enter the email address associated with your account.", "info");
        } else {
          setStatus("Enter your email and password to continue.", "info");
        }
      }
    } catch {
      setStatus("Lingolift account services could not be reached. Check your connection and refresh the page.", "error");
    }
  }

  initializeAuth();
}
