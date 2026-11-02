"use strict";

const navigation = document.querySelector(".primary-nav");
const signupLink = navigation?.querySelector(".nav-signup");
const loginLink = navigation?.querySelector("[data-auth-login]");
const authHeader = document.querySelector(".auth-header");
const brandLink = document.querySelector(".brand");

function getUserFullName(user) {
  const fullName = user.user_metadata?.full_name;
  return typeof fullName === "string" ? fullName.trim() : "";
}

function addProfileControl(mount, profileUrl, logoutButton) {
  const control = document.createElement("div");
  control.className = "nav-profile";
  control.hidden = true;

  const trigger = document.createElement("button");
  trigger.className = "nav-profile-trigger";
  trigger.type = "button";
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-haspopup", "true");
  trigger.setAttribute("aria-label", "Open account menu");

  const avatar = document.createElement("img");
  avatar.className = "nav-profile-avatar";
  avatar.alt = "";
  avatar.hidden = true;

  const initials = document.createElement("span");
  initials.className = "nav-profile-initials";
  initials.setAttribute("aria-hidden", "true");
  initials.textContent = "LL";

  const name = document.createElement("span");
  name.className = "nav-profile-name";
  name.textContent = "My account";

  trigger.append(avatar, initials, name);

  const menu = document.createElement("div");
  menu.className = "nav-profile-menu";
  menu.hidden = true;

  const profileLink = document.createElement("a");
  profileLink.className = "nav-profile-link";
  profileLink.href = profileUrl.href;
  profileLink.textContent = "My Profile";

  const settingsLink = document.createElement("a");
  settingsLink.href = `${profileUrl.href}#account-settings`;
  settingsLink.textContent = "Account Settings";

  logoutButton.classList.remove("nav-cta", "nav-signout");
  logoutButton.classList.add("nav-profile-signout");
  logoutButton.type = "button";
  logoutButton.textContent = "Sign Out";
  logoutButton.hidden = false;

  menu.append(profileLink, settingsLink, logoutButton);
  control.append(trigger, menu);
  mount.append(control);

  function closeMenu() {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  trigger.addEventListener("click", () => {
    const isOpen = trigger.getAttribute("aria-expanded") === "true";
    menu.hidden = isOpen;
    trigger.setAttribute("aria-expanded", String(!isOpen));
  });
  document.addEventListener("click", (event) => {
    if (event.target instanceof Node && !control.contains(event.target)) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
      trigger.focus();
    }
  });
  menu.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a, button")) closeMenu();
  });
  avatar.addEventListener("error", () => {
    avatar.hidden = true;
    initials.hidden = false;
  });

  return {
    control,
    logoutButton,
    render(user, avatarUrl) {
      const fullName = getUserFullName(user) || "My account";
      name.textContent = fullName;
      trigger.setAttribute("aria-label", `Open account menu for ${fullName}`);
      initials.textContent = fullName
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase();
      if (avatarUrl) {
        avatar.src = avatarUrl;
        avatar.hidden = false;
        initials.hidden = true;
      } else {
        avatar.removeAttribute("src");
        avatar.hidden = true;
        initials.hidden = false;
      }
    },
  };
}

async function initializeAuthNavigation() {
  if ((!navigation && !authHeader) || !brandLink) return;

  let authNavStatus = navigation?.querySelector("[data-auth-nav-status]");
  let authHeaderLinks;
  if (authHeader) {
    const contextualLinks = authHeader.querySelector(":scope > p");
    if (contextualLinks) contextualLinks.hidden = true;
    authHeaderLinks = document.createElement("div");
    authHeaderLinks.className = "auth-account-nav";

    const homeUrl = new URL(brandLink.getAttribute("href"), window.location.href);
    const login = document.createElement("a");
    login.href = new URL("login.html", homeUrl).href;
    login.textContent = "Log in";
    const signup = document.createElement("a");
    signup.href = new URL("signup.html", homeUrl).href;
    signup.textContent = "Sign up";

    authNavStatus = document.createElement("span");
    authNavStatus.className = "auth-nav-status";
    authNavStatus.setAttribute("role", "status");
    authNavStatus.setAttribute("aria-live", "polite");
    authHeaderLinks.append(login, signup, authNavStatus);
    authHeader.append(authHeaderLinks);
  }

  if (navigation && (!signupLink || !loginLink)) return;

  const { supabase } = await import("./supabase-client.js");
  if (!supabase) {
    if (authNavStatus) {
      authNavStatus.textContent = "Account status is unavailable. Sign-in links remain available.";
    }
    return;
  }

  const homeUrl = new URL(brandLink.getAttribute("href"), window.location.href);
  const profileUrl = new URL("profile.html", homeUrl);
  const profileMount = navigation || authHeaderLinks;
  const logoutButton = document.createElement("button");
  logoutButton.dataset.authLogout = "";
  const profileControl = addProfileControl(profileMount, profileUrl, logoutButton);
  let activeUserId = null;
  let profileLoadId = 0;

  function renderProfile(user, avatarUrl = null) {
    profileControl.render(user, avatarUrl);
  }

  async function loadProfile(user, requestId) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("full_name, avatar_path")
      .eq("id", user.id)
      .maybeSingle();
    if (requestId !== profileLoadId || user.id !== activeUserId) return;

    if (error) {
      authNavStatus.textContent = "Your profile details could not be loaded.";
      return;
    }

    const fullName =
      (typeof profile?.full_name === "string" ? profile.full_name.trim() : "") ||
      getUserFullName(user);
    const headerUser = {
      ...user,
      user_metadata: { ...user.user_metadata, full_name: fullName },
    };
    renderProfile(headerUser);

    const avatarPath = profile?.avatar_path;
    const allowedAvatarPaths = ["jpg", "png", "webp"].map(
      (extension) => `${user.id}/avatar.${extension}`,
    );
    if (!allowedAvatarPaths.includes(avatarPath)) return;

    const { data: signed, error: signedError } = await supabase.storage
      .from("avatars")
      .createSignedUrl(avatarPath, 300);
    if (requestId !== profileLoadId || user.id !== activeUserId) return;
    if (signedError) {
      authNavStatus.textContent = "Your profile picture could not be loaded.";
      return;
    }
    renderProfile(headerUser, signed.signedUrl);
  }

  function renderSession(session) {
    const user = session?.user ?? null;
    const isAuthenticated = Boolean(user);
    if (navigation) {
      signupLink.hidden = isAuthenticated;
      loginLink.hidden = isAuthenticated;
    } else if (authHeaderLinks) {
      authHeaderLinks.querySelectorAll("a").forEach((link) => {
        link.hidden = isAuthenticated;
      });
    }

    profileControl.control.hidden = !isAuthenticated;
    logoutButton.hidden = !isAuthenticated;
    activeUserId = user?.id ?? null;
    const requestId = ++profileLoadId;
    if (user) {
      const fallbackUser = {
        ...user,
        user_metadata: {
          ...user.user_metadata,
          full_name: getUserFullName(user) || "My account",
        },
      };
      renderProfile(fallbackUser);
      void loadProfile(user, requestId).catch(() => {
        if (requestId === profileLoadId) {
          authNavStatus.textContent = "Your profile details could not be loaded.";
        }
      });
    } else if (authNavStatus) {
      authNavStatus.textContent = "";
    }
  }

  supabase.auth.onAuthStateChange((_event, session) => renderSession(session));
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    if (authNavStatus) {
      authNavStatus.textContent = "Account status could not be checked. Sign-in links remain available.";
    }
    return;
  }
  renderSession(data.session);

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Signing out…";
    if (authNavStatus) authNavStatus.textContent = "";
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        if (authNavStatus) authNavStatus.textContent = "We couldn't sign you out. Please try again.";
        return;
      }
      if (authNavStatus) authNavStatus.textContent = "You have been signed out.";
      const homepageUrl = new URL(brandLink.getAttribute("href"), window.location.href);
      window.location.replace(homepageUrl.href);
    } catch {
      if (authNavStatus) {
        authNavStatus.textContent = "We couldn't sign you out. Check your connection and try again.";
      }
    } finally {
      logoutButton.disabled = false;
      logoutButton.textContent = "Sign Out";
    }
  });

  document.addEventListener("lingolift:profile-updated", (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (!detail || detail.userId !== activeUserId) return;
    const user = {
      id: activeUserId,
      user_metadata: { full_name: detail.fullName },
    };
    renderProfile(user, detail.avatarUrl || null);
  });
}

initializeAuthNavigation().catch(() => {
  const authNavStatus =
    navigation?.querySelector("[data-auth-nav-status]") ||
    authHeader?.querySelector(".auth-nav-status");
  if (authNavStatus) {
    authNavStatus.textContent = "Account status could not be checked. Sign-in links remain available.";
  }
});
