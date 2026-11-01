"use strict";

const navigation = document.querySelector(".primary-nav");
const signupLink = navigation?.querySelector(".nav-signup");
const loginLink = navigation?.querySelector("[data-auth-login]");
const logoutButton = navigation?.querySelector("[data-auth-logout]");
const authNavStatus = navigation?.querySelector("[data-auth-nav-status]");

async function initializeAuthNavigation() {
  if (!navigation || !signupLink || !loginLink || !logoutButton || !authNavStatus) return;

  const { supabase } = await import("./supabase-client.js");
  if (!supabase) {
    authNavStatus.textContent = "Account status is unavailable. Sign-in links remain available.";
    return;
  }

  function renderSession(session) {
    const isAuthenticated = Boolean(session?.user);
    signupLink.hidden = isAuthenticated;
    loginLink.hidden = isAuthenticated;
    logoutButton.hidden = !isAuthenticated;
  }

  supabase.auth.onAuthStateChange((_event, session) => renderSession(session));
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    authNavStatus.textContent = "Account status could not be checked. Sign-in links remain available.";
    return;
  }
  renderSession(data.session);

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Logging out…";
    authNavStatus.textContent = "";
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        authNavStatus.textContent = "We couldn't log you out. Please try again.";
        return;
      }
      authNavStatus.textContent = "You have been logged out.";
      renderSession(null);
    } catch {
      authNavStatus.textContent = "We couldn't log you out. Check your connection and try again.";
    } finally {
      logoutButton.disabled = false;
      logoutButton.textContent = "Log out";
    }
  });
}

initializeAuthNavigation().catch(() => {
  if (authNavStatus) {
    authNavStatus.textContent = "Account status could not be checked. Sign-in links remain available.";
  }
});
