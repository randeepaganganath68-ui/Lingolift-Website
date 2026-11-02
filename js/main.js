"use strict";

// Add the official store URL here once the app listing is live.
const PLAY_STORE_URL = "";

const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".primary-nav");

const signupLink = navigation?.querySelector(".nav-signup");
const brandLink = document.querySelector(".brand");
if (signupLink && brandLink) {
  const homepageUrl = new URL(brandLink.getAttribute("href"), window.location.href);
  const loginUrl = new URL("login.html", homepageUrl);
  if (loginUrl.origin === window.location.origin) {
    const loginLink = document.createElement("a");
    loginLink.className = "nav-cta nav-login";
    loginLink.href = loginUrl.href;
    loginLink.textContent = "Log in";
    loginLink.dataset.authLogin = "";

    const authNavStatus = document.createElement("span");
    authNavStatus.className = "auth-nav-status";
    authNavStatus.setAttribute("role", "status");
    authNavStatus.setAttribute("aria-live", "polite");
    authNavStatus.dataset.authNavStatus = "";

    signupLink.after(loginLink);
    loginLink.after(authNavStatus);
  }
}

const authHeader = document.querySelector(".auth-header");
if (navigation || authHeader) {
  import("./auth-navigation.js").catch(() => {
    const authNavStatus = navigation?.querySelector("[data-auth-nav-status]");
    if (authNavStatus) {
      authNavStatus.textContent = "Account status could not be checked. Sign-in links remain available.";
    }
  });
}

if (menuButton && navigation) {
  const closeMenu = () => {
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Open menu");
    navigation.classList.remove("is-open");
    document.body.classList.remove("menu-open");
  };

  menuButton.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!isOpen));
    menuButton.setAttribute("aria-label", isOpen ? "Open menu" : "Close menu");
    navigation.classList.toggle("is-open", !isOpen);
    document.body.classList.toggle("menu-open", !isOpen);
  });

  navigation.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) closeMenu();
    if (event.target instanceof Element && event.target.closest("[data-auth-logout]")) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  const desktopViewport = window.matchMedia("(min-width: 761px)");
  const closeMenuOnDesktop = (event) => {
    if (event.matches) closeMenu();
  };
  if ("addEventListener" in desktopViewport) {
    desktopViewport.addEventListener("change", closeMenuOnDesktop);
  } else {
    desktopViewport.addListener(closeMenuOnDesktop);
  }
}

document.querySelectorAll("[data-year]").forEach((element) => {
  element.textContent = String(new Date().getFullYear());
});

document.querySelectorAll("[data-play-store-link]").forEach((link) => {
  if (PLAY_STORE_URL) {
    const storeUrl = new URL(PLAY_STORE_URL);
    if (storeUrl.protocol !== "https:" || storeUrl.hostname !== "play.google.com" || storeUrl.pathname !== "/store/apps/details" || storeUrl.username || storeUrl.password) {
      throw new Error("PLAY_STORE_URL must be an official HTTPS Google Play app listing URL.");
    }

    link.setAttribute("href", storeUrl.href);
    link.removeAttribute("aria-disabled");
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
    const status = document.querySelector("[data-play-store-status]");
    if (status) status.textContent = "Opens the official Lingolift listing on Google Play.";
  } else {
    link.addEventListener("click", (event) => event.preventDefault());
  }
});

const revealElements = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealElements.forEach((element) => revealObserver.observe(element));
} else {
  revealElements.forEach((element) => element.classList.add("is-visible"));
}
