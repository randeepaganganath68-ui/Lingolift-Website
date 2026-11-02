"use strict";

const signedUrlLifetimeSeconds = 300;
const refreshBeforeExpiryMs = 240_000;

let activeSupabase;
let authSubscription;
let activeUserId = null;
let activePath = null;
let activeSignedUrl = null;
let refreshTimer = null;
let requestVersion = 0;
let signedUrlRequest = null;
let userVerificationRequest = null;

export function isOwnedAvatarPath(path, userId) {
  return (
    typeof path === "string" &&
    ["jpg", "png", "webp"].some((extension) => path === `${userId}/avatar.${extension}`)
  );
}

function publishAvatarUrl(userId, path, url, reason = "updated") {
  document.dispatchEvent(
    new CustomEvent("lingolift:avatar-url-updated", {
      detail: { userId, path, url, reason },
    }),
  );
}

function clearRefreshTimer() {
  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

export function clearOwnAvatarUrl(reason = "cleared") {
  const previousUserId = activeUserId;
  const previousPath = activePath;
  clearRefreshTimer();
  requestVersion += 1;
  activeUserId = null;
  activePath = null;
  activeSignedUrl = null;
  signedUrlRequest = null;
  if (previousUserId && previousPath) {
    publishAvatarUrl(previousUserId, previousPath, null, reason);
  }
}

function observeAuthChanges(supabase) {
  if (activeSupabase === supabase) return;
  authSubscription?.unsubscribe();
  activeSupabase = supabase;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (activeUserId && session?.user?.id !== activeUserId) {
      clearOwnAvatarUrl("identity-changed");
    }
  });
  authSubscription = data.subscription;
}

function scheduleRefresh(supabase, userId, path) {
  clearRefreshTimer();
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    void refreshOwnAvatarUrl(supabase, userId, path).catch(() => {});
  }, refreshBeforeExpiryMs);
}

async function verifyAuthenticatedUser(supabase, userId) {
  if (
    userVerificationRequest?.supabase === supabase &&
    userVerificationRequest.userId === userId
  ) {
    return userVerificationRequest.promise;
  }
  const promise = (async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session?.user.id !== userId) {
      throw new Error("The authenticated user does not own the requested avatar.");
    }
  })();
  userVerificationRequest = { supabase, userId, promise };
  try {
    await promise;
  } finally {
    if (userVerificationRequest?.promise === promise) userVerificationRequest = null;
  }
}

async function createSignedUrl(supabase, userId, path, forceRefresh) {
  if (!isOwnedAvatarPath(path, userId)) {
    throw new Error("The requested avatar path is not owned by the authenticated user.");
  }
  observeAuthChanges(supabase);

  const sameAvatar = activeUserId === userId && activePath === path;
  if (sameAvatar && signedUrlRequest) return signedUrlRequest.promise;
  if (sameAvatar && !forceRefresh && activeSignedUrl) {
    const cachedUrl = activeSignedUrl;
    try {
      await verifyAuthenticatedUser(supabase, userId);
    } catch (error) {
      if (
        activeUserId === userId &&
        activePath === path &&
        activeSignedUrl === cachedUrl
      ) {
        clearOwnAvatarUrl("refresh-failed");
      }
      throw error;
    }
    if (
      activeUserId !== userId ||
      activePath !== path ||
      activeSignedUrl !== cachedUrl
    ) {
      throw new Error("The avatar request is no longer current.");
    }
    return cachedUrl;
  }

  if (!sameAvatar) {
    clearRefreshTimer();
    requestVersion += 1;
    activeUserId = userId;
    activePath = path;
    activeSignedUrl = null;
    signedUrlRequest = null;
  }

  const version = ++requestVersion;
  const request = (async () => {
    await verifyAuthenticatedUser(supabase, userId);
    if (
      version !== requestVersion ||
      activeUserId !== userId ||
      activePath !== path
    ) {
      throw new Error("The avatar request is no longer current.");
    }
    const { data, error } = await supabase.storage
      .from("avatars")
      .createSignedUrl(path, signedUrlLifetimeSeconds);
    if (error) throw error;
    if (
      version !== requestVersion ||
      activeUserId !== userId ||
      activePath !== path
    ) {
      throw new Error("The avatar request is no longer current.");
    }
    activeSignedUrl = data.signedUrl;
    scheduleRefresh(supabase, userId, path);
    publishAvatarUrl(userId, path, activeSignedUrl);
    return activeSignedUrl;
  })();
  signedUrlRequest = { userId, path, promise: request };

  try {
    return await request;
  } catch (error) {
    if (
      version === requestVersion &&
      activeUserId === userId &&
      activePath === path
    ) {
      clearOwnAvatarUrl("refresh-failed");
    }
    throw error;
  } finally {
    if (signedUrlRequest?.promise === request) signedUrlRequest = null;
  }
}

export function getOwnAvatarUrl(supabase, userId, path) {
  return createSignedUrl(supabase, userId, path, false);
}

export function refreshOwnAvatarUrl(supabase, userId, path) {
  return createSignedUrl(supabase, userId, path, true);
}
