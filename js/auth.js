"use strict";

const authForm = document.querySelector("[data-auth-form]");

if (authForm) {
  const authPage = authForm.dataset.authForm;
  const authStatus = document.querySelector("#auth-status");
  const authFieldset = authForm.querySelector("fieldset");
  const submitButton = authForm.querySelector('button[type="submit"]');
  const defaultSubmitLabel = submitButton.textContent.trim();
  let supabaseClient;
  let signupAvatarTools;
  let signupAvatarEditor;
  let formReady = false;
  let requestInProgress = false;
  let recoverySessionDetected = false;
  let turnstileWidgetId = null;
  let turnstileToken = "";

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

  async function applyPendingSignupAvatar(user) {
    if (!signupAvatarTools) return { status: "none" };
    try {
      return await signupAvatarTools.applyPendingSignupAvatar(supabaseClient, user);
    } catch {
      return {
        status: "failed",
        message: "Your signup picture couldn't be saved. You can upload it from profile settings.",
      };
    }
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
    const callbackParams = new URLSearchParams(
      `${currentUrl.search.slice(1)}&${currentUrl.hash.slice(1)}`,
    );
    const containsAuthData =
      currentUrl.searchParams.has("code") ||
      ["access_token", "refresh_token", "error", "error_code", "error_description"].some(
        (parameter) => callbackParams.has(parameter),
      );
    if (!containsAuthData) return;

    const cleanUrl = new URL(currentUrl.pathname, currentUrl.origin);
    if (currentUrl.searchParams.get("confirmed") === "1") {
      cleanUrl.searchParams.set("confirmed", "1");
    }
    history.replaceState(history.state, "", cleanUrl.href);
  }

  const signupResponseMessage =
    "If registration was accepted, check your inbox for a verification link. If you already have an account, log in or use Forgot your password.";

  function isDuplicateSignupError(error) {
    const code = error && typeof error.code === "string" ? error.code : "";
    return code === "email_exists" || code === "user_already_exists";
  }

  function authErrorMessage(error, action) {
    const code = error && typeof error.code === "string" ? error.code : "";
    const message =
      error && typeof error.message === "string" ? error.message.trim().toLowerCase() : "";
    if (
      code === "invalid_credentials" ||
      code === "email_not_confirmed" ||
      message === "invalid login credentials" ||
      message === "email not confirmed"
    ) {
      return "Those sign-in details could not be verified. Check your email and password, and verify your email if you just registered.";
    }
    if (code === "weak_password") {
      return "Choose a stronger password and try again.";
    }
    if (code === "same_password") {
      return "Choose a password different from your current password.";
    }
    if (
      code === "over_email_send_rate_limit" ||
      code === "over_daily_send_email_limit" ||
      code === "over_request_rate_limit"
    ) {
      return action === "signup"
        ? "Signup or verification emails are temporarily rate-limited. Please wait before trying again. If you already have an account, log in or use Forgot your password."
        : "Too many requests were made. Please wait a little while and try again.";
    }
    if (action === "signup" && (code === "signup_disabled" || code === "email_provider_disabled")) {
      return "Email signup is temporarily unavailable. Please try again later or contact Lingolift support.";
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
      const registerToggleLabel = (key) => {
        if (window.LingoliftI18n) {
          window.LingoliftI18n.registerElement(toggle, key);
        } else {
          toggle.dataset.i18n = key;
        }
      };
      registerToggleLabel("auth.show");

      toggle.addEventListener("click", () => {
        const passwordInput = document.getElementById(toggle.getAttribute("aria-controls"));
        if (!(passwordInput instanceof HTMLInputElement)) return;
        const shouldShow = passwordInput.type === "password";
        passwordInput.type = shouldShow ? "text" : "password";
        toggle.textContent = shouldShow ? "Hide" : "Show";
        registerToggleLabel(shouldShow ? "auth.hide" : "auth.show");
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

  async function initializeTurnstile() {
    if (authPage !== "signup") return;

    const container = authForm.querySelector("[data-turnstile]");
    if (!container) throw new Error("The signup CAPTCHA widget is missing.");

    if (!window.turnstile) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error("Could not load the CAPTCHA service."));
        document.head.appendChild(script);
      });
    }

    if (!window.turnstile) throw new Error("The CAPTCHA service did not initialize.");

    turnstileWidgetId = window.turnstile.render(container, {
      sitekey: container.dataset.sitekey,
      callback: (token) => {
        turnstileToken = token;
        setStatus("CAPTCHA verified. You can create your account.", "success");
      },
      "expired-callback": () => {
        turnstileToken = "";
        setStatus("CAPTCHA expired. Please complete the check again.", "error");
      },
      "error-callback": () => {
        turnstileToken = "";
        setStatus("CAPTCHA could not load correctly. Refresh the page and try again.", "error");
      },
    });
  }

  async function submitAuthForm(event) {
    event.preventDefault();
    if (authPage === "signup" || authPage === "reset") updatePasswordMatch();
    if (requestInProgress || !formReady || !authForm.reportValidity()) return;
    if (authPage === "signup" && !turnstileToken) {
      setStatus("Please complete the CAPTCHA check before creating your account.", "error");
      return;
    }

    const fullNameInput = authForm.elements.namedItem("fullName");
    const fullName = fullNameInput instanceof HTMLInputElement ? fullNameInput.value.trim() : "";
    if (authPage === "signup" && !fullName) {
      setStatus("Enter your full name to create an account.", "error");
      if (fullNameInput instanceof HTMLInputElement) fullNameInput.focus();
      return;
    }

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
        const croppedAvatar = signupAvatarEditor?.hasImage
          ? await signupAvatarEditor.createCroppedAvatar()
          : null;
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: siteUrl("login.html?confirmed=1"),
            captchaToken: turnstileToken,
          },
        });
        if (error && !isDuplicateSignupError(error)) {
          setStatus(authErrorMessage(error, "signup"), "error");
        } else {
          let avatarMessage = "";
          let avatarState = "success";
          if (!error && croppedAvatar) {
            const savedAvatar = await signupAvatarTools.savePendingSignupAvatar(email, croppedAvatar);
            if (!savedAvatar.ok) {
              avatarMessage = "Your account was created, but the picture couldn't be saved in this browser. You can add it later from profile settings.";
              avatarState = "warning";
            } else if (data.session?.user) {
              const avatarResult = await applyPendingSignupAvatar(data.session.user);
              if (avatarResult.status === "failed") {
                avatarMessage = avatarResult.message;
                avatarState = "warning";
              } else if (avatarResult.status === "uploaded") {
                avatarMessage = avatarResult.message;
              }
            } else {
              avatarMessage = "Your picture is saved in this browser and will be added after you verify your email and log in here.";
            }
          }
          if (!error && data.session) {
            const { error: signOutError } = await supabaseClient.auth.signOut();
            if (signOutError) {
              console.error(
                "Could not clear the signup session before email verification.",
                signOutError,
              );
            }
          }
          setStatus(
            `${signupResponseMessage}${avatarMessage ? ` ${avatarMessage}` : ""}`,
            avatarState,
          );
          authForm.reset();
          signupAvatarEditor?.clear();
        }
      } else if (authPage === "login") {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
          setStatus(authErrorMessage(error, "login"), "error");
        } else {
          const avatarResult = data.user
            ? await applyPendingSignupAvatar(data.user)
            : { status: "none" };
          if (avatarResult.status === "failed") {
            setStatus(`You are logged in. ${avatarResult.message}`, "warning");
            return;
          }
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
      if (authPage === "signup" && window.turnstile && turnstileWidgetId !== null) {
        turnstileToken = "";
        window.turnstile.reset(turnstileWidgetId);
      }
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
      if (authPage === "signup" || authPage === "login") {
        signupAvatarTools = await import("./signup-avatar.js");
        if (authPage === "signup") {
          signupAvatarEditor = signupAvatarTools.createSignupAvatarEditor(authForm);
        }
      }
      const { supabase } = await import("./supabase-client.js");
      if (!supabase) {
        setStatus("Account services are not configured. Please contact the Lingolift website owner.", "error");
        return;
      }
      supabaseClient = supabase;
      if (authPage === "signup") {
        try {
          await initializeTurnstile();
        } catch {
          setStatus("CAPTCHA could not be initialized. Refresh the page and try again.", "error");
          return;
        }
      }
      const callbackParams = new URLSearchParams(
        `${window.location.search.slice(1)}&${window.location.hash.slice(1)}`,
      );
      if (authPage === "reset") {
        recoverySessionDetected = callbackParams.get("type") === "recovery";
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
      if (callbackParams.has("error") || callbackParams.has("error_code")) {
        setStatus(
          "This email link is invalid or has expired. Request a new email and try again.",
          "error",
        );
        return;
      }

      const avatarResult = authPage === "login" && data.session?.user
        ? await applyPendingSignupAvatar(data.session.user)
        : { status: "none" };

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
          const emailVerified = Boolean(data.session?.user.email_confirmed_at);
          const confirmationMessage = emailVerified
            ? "Your email has been verified and your session is active. Continue to Lingolift from the home page."
            : data.session
              ? "You have returned from the email verification link with an active session. If your email is not verified, check your inbox."
              : "You have returned from the email verification link. If it was valid, you can now log in.";
          const message = avatarResult.status === "failed"
            ? `${confirmationMessage} ${avatarResult.message}`
            : avatarResult.status === "uploaded"
              ? `${confirmationMessage} ${avatarResult.message}`
              : confirmationMessage;
          setStatus(message, avatarResult.status === "failed" ? "warning" : "success");
        } else if (authPage === "login" && data.session) {
          setStatus(
            avatarResult.message || "You are already logged in. Continue to Lingolift from the home page.",
            avatarResult.status === "failed" ? "warning" : "info",
          );
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
