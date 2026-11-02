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
  avatar.addEventListener("load", () => {
    if (avatar.getAttribute("src") && avatar.complete && avatar.naturalWidth > 0) {
      initials.hidden = true;
    }
  });

  return {
    control,
    logoutButton,
    avatar,
    clearAvatar() {
      avatar.removeAttribute("src");
      avatar.hidden = true;
      initials.hidden = false;
    },
    renderLoading() {
      name.textContent = "Loading account…";
      trigger.setAttribute("aria-label", "Loading account");
      initials.textContent = "…";
      this.clearAvatar();
    },
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
        const isNewUrl = avatar.getAttribute("src") !== avatarUrl;
        if (isNewUrl) {
          initials.hidden = false;
          avatar.src = avatarUrl;
        }
        avatar.hidden = false;
        if (!isNewUrl) initials.hidden = avatar.complete && avatar.naturalWidth > 0;
      } else {
        this.clearAvatar();
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
  let getOwnProfile;
  let setOwnProfile;
  let clearOwnProfile;
  let isOwnedAvatarPath;
  let activeAvatarPath = null;
  let activeAvatarUrl = null;
  let activeHeaderUser = null;
  let avatarErrorRefreshUsed = false;
  let getOwnAvatarUrl;
  let refreshOwnAvatarUrl;
  let clearOwnAvatarUrl;
  let profileLoadId = 0;
  let profileLoadingUserId = null;
  let profileLoadedUserId = null;

  function renderProfile(user, avatarUrl = null) {
    activeAvatarUrl = avatarUrl;
    activeHeaderUser = user;
    profileControl.render(user, avatarUrl);
  }

  async function loadProfile(user, requestId) {
    let profile;
    try {
      profile = await getOwnProfile(supabase, user.id);
    } catch {
      if (requestId === profileLoadId && user.id === activeUserId && authNavStatus) {
        authNavStatus.textContent = "Your profile details could not be loaded.";
      }
      return false;
    }
    if (requestId !== profileLoadId || user.id !== activeUserId) return;

    const fullName =
      (typeof profile?.full_name === "string" ? profile.full_name.trim() : "") ||
      getUserFullName(user);
    const headerUser = {
      ...user,
      user_metadata: { ...user.user_metadata, full_name: fullName },
    };
    activeAvatarPath = profile?.avatar_path || null;
    renderProfile(headerUser);

    if (!isOwnedAvatarPath(activeAvatarPath, user.id)) return true;

    try {
      const signedUrl = await getOwnAvatarUrl(supabase, user.id, activeAvatarPath);
      if (requestId !== profileLoadId || user.id !== activeUserId) return;
      renderProfile(headerUser, signedUrl);
    } catch {
      if (requestId === profileLoadId && user.id === activeUserId && authNavStatus) {
        authNavStatus.textContent = "Your profile picture could not be loaded.";
      }
    }
    return true;
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
    const nextUserId = user?.id ?? null;
    const previousUserId = activeUserId;
    const userChanged = nextUserId !== activeUserId;
    if (userChanged) {
      if (previousUserId) {
        clearOwnAvatarUrl();
        clearOwnProfile(previousUserId);
      }
      activeAvatarPath = null;
      activeAvatarUrl = null;
      activeHeaderUser = null;
      avatarErrorRefreshUsed = false;
      profileLoadedUserId = null;
      profileLoadingUserId = null;
      profileControl.clearAvatar();
    }
    activeUserId = nextUserId;
    if (
      user &&
      !userChanged &&
      (profileLoadedUserId === user.id || profileLoadingUserId === user.id)
    ) {
      return;
    }
    const requestId = ++profileLoadId;
    if (user) {
      profileControl.renderLoading();
      profileLoadingUserId = user.id;
      void loadProfile(user, requestId)
        .catch(() => false)
        .then((loaded) => {
          if (loaded && requestId === profileLoadId && user.id === activeUserId) {
            profileLoadedUserId = user.id;
          }
        })
        .catch(() => {
          if (requestId === profileLoadId && authNavStatus) {
            authNavStatus.textContent = "Your profile details could not be loaded.";
          }
        })
        .finally(() => {
          if (requestId === profileLoadId && profileLoadingUserId === user.id) {
            profileLoadingUserId = null;
          }
          if (
            requestId === profileLoadId &&
            user.id === activeUserId &&
            activeHeaderUser === null
          ) {
            const fallbackUser = {
              ...user,
              user_metadata: { ...user.user_metadata, full_name: "My account" },
            };
            renderProfile(fallbackUser);
          }
        });
    } else {
      activeAvatarPath = null;
      activeAvatarUrl = null;
      activeHeaderUser = null;
      profileControl.clearAvatar();
      if (authNavStatus) authNavStatus.textContent = "";
    }
  }

  ({
    isOwnedAvatarPath,
    getOwnAvatarUrl,
    refreshOwnAvatarUrl,
    clearOwnAvatarUrl,
  } = await import("./avatar-signed-url.js"));
  ({ getOwnProfile, setOwnProfile, clearOwnProfile } = await import("./profile-cache.js"));
  document.addEventListener("lingolift:avatar-url-updated", (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (
      !detail ||
      detail.userId !== activeUserId ||
      detail.path !== activeAvatarPath ||
      !activeHeaderUser
    ) {
      return;
    }
    renderProfile(activeHeaderUser, detail.url);
    if (authNavStatus) {
      if (!detail.url && detail.reason === "refresh-failed") {
        authNavStatus.textContent = "Your profile picture could not be refreshed.";
      } else if (
        detail.url &&
        authNavStatus.textContent === "Your profile picture could not be refreshed."
      ) {
        authNavStatus.textContent = "";
      }
    }
  });
  profileControl.avatar.addEventListener("load", () => {
    avatarErrorRefreshUsed = false;
  });
  profileControl.avatar.addEventListener("error", () => {
    if (
      !activeAvatarUrl ||
      profileControl.avatar.src !== activeAvatarUrl ||
      !activeUserId ||
      !isOwnedAvatarPath(activeAvatarPath, activeUserId)
    ) {
      return;
    }
    const userId = activeUserId;
    const path = activeAvatarPath;
    renderProfile(activeHeaderUser);
    if (avatarErrorRefreshUsed) {
      clearOwnAvatarUrl();
      return;
    }
    avatarErrorRefreshUsed = true;
    void refreshOwnAvatarUrl(supabase, userId, path).catch(() => {
      if (
        authNavStatus &&
        activeUserId === userId &&
        activeAvatarPath === path
      ) {
        authNavStatus.textContent = "Your profile picture could not be refreshed.";
      }
    });
  });
  document.addEventListener("lingolift:profile-updated", (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (!detail || detail.userId !== activeUserId) return;
    const user = {
      id: activeUserId,
      user_metadata: { full_name: detail.fullName },
    };
    const updatedAvatarPath = isOwnedAvatarPath(detail.avatarPath, activeUserId)
      ? detail.avatarPath
      : null;
    setOwnProfile(supabase, activeUserId, {
      full_name: detail.fullName,
      avatar_path: updatedAvatarPath,
      updated_at: new Date().toISOString(),
    });
    if (updatedAvatarPath !== activeAvatarPath) avatarErrorRefreshUsed = false;
    activeAvatarPath = updatedAvatarPath;
    renderProfile(user, activeAvatarPath ? detail.avatarUrl || null : null);
  });

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

}

initializeAuthNavigation().catch(() => {
  const authNavStatus =
    navigation?.querySelector("[data-auth-nav-status]") ||
    authHeader?.querySelector(".auth-nav-status");
  if (authNavStatus) {
    authNavStatus.textContent = "Account status could not be checked. Sign-in links remain available.";
  }
});
