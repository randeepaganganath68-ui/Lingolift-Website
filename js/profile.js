"use strict";

const profileStatus = document.querySelector("#profile-status");
const profileGate = document.querySelector("[data-profile-gate]");
const profileContent = document.querySelector("[data-profile-content]");
const profileForm = document.querySelector("[data-profile-name-form]");
const fullNameInput = document.querySelector("#profile-full-name");
const emailElement = document.querySelector("[data-profile-email]");
const avatarFileInput = document.querySelector("[data-avatar-file]");
const avatarImage = document.querySelector("[data-profile-avatar]");
const avatarPlaceholder = document.querySelector("[data-profile-avatar-placeholder]");
const uploadButton = document.querySelector("[data-avatar-upload]");
const removeButton = document.querySelector("[data-avatar-remove]");
const saveButton = document.querySelector("[data-profile-save]");
const loginLink = profileGate?.querySelector("a");

if (
  profileStatus &&
  profileGate &&
  profileContent &&
  profileForm &&
  fullNameInput instanceof HTMLInputElement &&
  emailElement &&
  avatarFileInput instanceof HTMLInputElement &&
  avatarImage instanceof HTMLImageElement &&
  avatarPlaceholder &&
  uploadButton instanceof HTMLButtonElement &&
  removeButton instanceof HTMLButtonElement &&
  saveButton instanceof HTMLButtonElement
) {
  const maxAvatarSize = 2 * 1024 * 1024;
  const extensionsByType = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const controls = [fullNameInput, avatarFileInput, uploadButton, removeButton, saveButton];
  let supabaseClient;
  let currentUser;
  let currentProfile;
  let savedAvatarUrl;
  let selectedAvatar;
  let previewUrl;
  let currentAvatarUrl;
  let requestInProgress = false;
  let isOwnedAvatarPath;
  let getOwnAvatarUrl;
  let refreshOwnAvatarUrl;
  let clearOwnAvatarUrl;
  let getOwnProfile;
  let setOwnProfile;
  let clearOwnProfile;
  let avatarErrorRefreshUsed = false;

  function setStatus(message, state = "info") {
    profileStatus.textContent = message;
    profileStatus.dataset.state = state;
  }

  function getUserFullName(user) {
    const fullName = user.user_metadata?.full_name;
    return typeof fullName === "string" ? fullName.trim() : "";
  }

  function setBusy(busy, activeButton, busyLabel) {
    requestInProgress = busy;
    controls.forEach((control) => {
      control.disabled = busy;
    });
    uploadButton.disabled = busy || !selectedAvatar;
    removeButton.disabled = busy || !currentProfile?.avatar_path;
    if (busy && activeButton && busyLabel) activeButton.textContent = busyLabel;
    if (!busy) {
      saveButton.textContent = "Save changes";
      uploadButton.textContent = "Upload picture";
      removeButton.textContent = "Remove picture";
    }
  }

  function displayAvatar(url) {
    currentAvatarUrl = url;
    if (url) {
      const isNewUrl = avatarImage.getAttribute("src") !== url;
      if (isNewUrl) avatarImage.src = url;
      avatarImage.hidden = false;
      avatarPlaceholder.hidden = !isNewUrl && avatarImage.complete && avatarImage.naturalWidth > 0;
    } else {
      avatarImage.removeAttribute("src");
      avatarImage.hidden = true;
      avatarPlaceholder.hidden = false;
    }
  }

  function broadcastProfileUpdate() {
    document.dispatchEvent(
      new CustomEvent("lingolift:profile-updated", {
        detail: {
          userId: currentUser.id,
          fullName: currentProfile.full_name || "",
          avatarUrl: currentAvatarUrl,
          avatarPath: currentProfile.avatar_path || null,
        },
      }),
    );
  }

  async function getSignedAvatarUrl(path, userId) {
    if (!path) return null;
    if (!isOwnedAvatarPath(path, userId)) {
      throw new Error("The saved profile picture path is invalid.");
    }
    return getOwnAvatarUrl(supabaseClient, userId, path);
  }

  async function getActiveUser() {
    const { data, error } = await supabaseClient.auth.getUser();
    if (error || !data.user) {
      const previousUserId = currentUser?.id;
      currentUser = null;
      currentProfile = null;
      clearTemporaryAvatarState();
      clearOwnProfile(previousUserId);
      setStatus("Your session may have expired. Log in again to manage your profile.", "error");
      profileGate.hidden = false;
      profileContent.hidden = true;
      return null;
    }
    if (currentUser && data.user.id !== currentUser.id) {
      const previousUserId = currentUser.id;
      currentUser = null;
      currentProfile = null;
      clearTemporaryAvatarState();
      clearOwnProfile(previousUserId);
      setStatus("Your signed-in account changed. Refresh this page to continue.", "error");
      profileGate.hidden = false;
      profileContent.hidden = true;
      return null;
    }
    currentUser = data.user;
    return currentUser;
  }

  async function updateCurrentProfile(values) {
    const user = await getActiveUser();
    if (!user) return null;

    const { data, error } = await supabaseClient
      .from("profiles")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .select("full_name, avatar_path, updated_at")
      .single();
    if (error) return { error };

    currentProfile = data;
    setOwnProfile(supabaseClient, user.id, data);
    return { data };
  }

  async function removeOwnedAvatar(path, userId) {
    if (!isOwnedAvatarPath(path, userId)) return { skipped: true };
    const { error } = await supabaseClient.storage.from("avatars").remove([path]);
    return { error: error || null, skipped: false };
  }

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    selectedAvatar = null;
    avatarFileInput.value = "";
    displayAvatar(savedAvatarUrl || null);
    uploadButton.disabled = requestInProgress || !selectedAvatar;
  }

  function clearTemporaryAvatarState() {
    clearOwnAvatarUrl();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    selectedAvatar = null;
    savedAvatarUrl = null;
    currentAvatarUrl = null;
    avatarErrorRefreshUsed = false;
    avatarFileInput.value = "";
    displayAvatar(null);
  }

  async function loadProfile() {
    try {
      const { supabase } = await import("./supabase-client.js");
      if (!supabase) {
        setStatus("Account services are not configured. Please contact the Lingolift website owner.", "error");
        return;
      }
      supabaseClient = supabase;
      ({
        isOwnedAvatarPath,
        getOwnAvatarUrl,
        refreshOwnAvatarUrl,
        clearOwnAvatarUrl,
      } = await import("./avatar-signed-url.js"));
      ({ getOwnProfile, setOwnProfile, clearOwnProfile } = await import("./profile-cache.js"));
      supabaseClient.auth.onAuthStateChange((event, session) => {
        if (
          event === "SIGNED_OUT" ||
          (currentUser && session?.user?.id !== currentUser.id)
        ) {
          const previousUserId = currentUser?.id;
          currentUser = null;
          currentProfile = null;
          clearTemporaryAvatarState();
          clearOwnProfile(previousUserId);
          profileContent.hidden = true;
          profileGate.hidden = false;
          setStatus(
            event === "SIGNED_OUT"
              ? "You have been signed out. Log in again to manage your profile."
              : "Your signed-in account changed. Refresh this page to continue.",
            "error",
          );
        }
      });
      document.addEventListener("lingolift:avatar-url-updated", (event) => {
        const detail = event instanceof CustomEvent ? event.detail : null;
        if (
          !detail ||
          detail.userId !== currentUser?.id ||
          detail.path !== currentProfile?.avatar_path
        ) {
          return;
        }
        savedAvatarUrl = detail.url;
        displayAvatar(detail.url);
        if (detail.url) {
          if (
            profileStatus.textContent ===
            "Your picture couldn't be refreshed. You can upload it again."
          ) {
            setStatus("Your profile is ready.", "success");
          }
        } else if (detail.reason === "refresh-failed") {
          setStatus("Your picture couldn't be refreshed. You can upload it again.", "warning");
        }
      });
      const { data: authData, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !authData.user) {
        const previousUserId = currentUser?.id;
        currentUser = null;
        currentProfile = null;
        clearTemporaryAvatarState();
        clearOwnProfile(previousUserId);
        setStatus("Log in to view and manage your profile.", "error");
        profileGate.hidden = false;
        return;
      }
      currentUser = authData.user;
      const profileUserId = currentUser.id;

      let profile;
      try {
        profile = await getOwnProfile(supabaseClient, profileUserId);
      } catch {
        if (currentUser?.id !== profileUserId) return;
        setStatus("We couldn't load your profile. Check your connection and profile access, then try again.", "error");
        return;
      }
      if (!profile) {
        if (currentUser?.id !== profileUserId) return;
        setStatus("Your profile record isn't available yet. Please contact the Lingolift website owner.", "error");
        return;
      }
      if (currentUser?.id !== profileUserId) return;

      currentProfile = profile;
      fullNameInput.value =
        (typeof profile.full_name === "string" ? profile.full_name.trim() : "") ||
        getUserFullName(currentUser);
      emailElement.textContent = currentUser.email || "Email unavailable";
      profileContent.hidden = false;
      removeButton.hidden = !profile.avatar_path;

      if (profile.avatar_path) {
        try {
          savedAvatarUrl = await getSignedAvatarUrl(profile.avatar_path, currentUser.id);
          if (currentUser?.id !== profileUserId) return;
          avatarErrorRefreshUsed = false;
          displayAvatar(savedAvatarUrl);
        } catch {
          if (currentUser?.id !== profileUserId) return;
          setStatus("Your profile loaded, but its picture couldn't be displayed. You can upload it again.", "warning");
        }
      } else {
        savedAvatarUrl = null;
        clearOwnAvatarUrl();
        avatarErrorRefreshUsed = false;
        displayAvatar(null);
      }
      setBusy(false);
      if (profileStatus.dataset.state !== "warning") {
        setStatus("Your profile is ready.", "success");
      }
      broadcastProfileUpdate();
    } catch {
      setStatus("We couldn't reach account services. Check your connection and try again.", "error");
    }
  }

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (requestInProgress) return;
    const fullName = fullNameInput.value.trim();
    if (!fullName) {
      setStatus("Enter your full name before saving.", "error");
      fullNameInput.focus();
      return;
    }

    setBusy(true, saveButton, "Saving…");
    setStatus("Saving your profile…");
    try {
      const result = await updateCurrentProfile({ full_name: fullName });
      if (!result) return;
      if (result.error) {
        setStatus("We couldn't save your profile. Check your connection and profile permissions, then try again.", "error");
        return;
      }
      fullNameInput.value = result.data.full_name || fullName;
      setStatus("Your profile has been updated.", "success");
      broadcastProfileUpdate();
    } catch {
      setStatus("We couldn't save your profile. Check your connection and try again.", "error");
    } finally {
      setBusy(false);
    }
  });

  avatarFileInput.addEventListener("change", () => {
    const file = avatarFileInput.files?.[0];
    if (!file) return;
    if (!Object.prototype.hasOwnProperty.call(extensionsByType, file.type)) {
      clearPreview();
      setStatus("Choose a JPEG, PNG or WebP image.", "error");
      return;
    }
    if (file.size === 0 || file.size > maxAvatarSize) {
      clearPreview();
      setStatus("Choose an image larger than 0 bytes and no larger than 2 MB.", "error");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    selectedAvatar = file;
    previewUrl = URL.createObjectURL(file);
    displayAvatar(previewUrl);
    uploadButton.disabled = false;
    setStatus("Preview ready. Upload the picture to save it.", "info");
  });

  uploadButton.addEventListener("click", async () => {
    if (requestInProgress || !selectedAvatar) return;
    const user = await getActiveUser();
    if (!user) return;

    const extension = extensionsByType[selectedAvatar.type];
    const newPath = `${user.id}/avatar.${extension}`;
    const oldPath = currentProfile.avatar_path;
    setBusy(true, uploadButton, "Uploading…");
    setStatus("Uploading your picture…");
    try {
      const { error: uploadError } = await supabaseClient.storage
        .from("avatars")
        .upload(newPath, selectedAvatar, {
          cacheControl: "300",
          contentType: selectedAvatar.type,
          upsert: true,
        });
      if (uploadError) {
        setStatus("We couldn't upload that picture. Check your connection and avatar permissions, then try again.", "error");
        return;
      }

      const result = await updateCurrentProfile({ avatar_path: newPath });
      if (!result) return;
      if (result.error) {
        let cleanupFailed = false;
        if (newPath !== oldPath) {
          const cleanup = await removeOwnedAvatar(newPath, user.id);
          cleanupFailed = Boolean(cleanup.error);
        }
        setStatus(
          cleanupFailed
            ? "The profile couldn't be updated, and the uploaded picture couldn't be cleaned up. Please contact the Lingolift website owner."
            : "We couldn't save the picture to your profile. Check your profile permissions, then try again.",
          "error",
        );
        return;
      }

      avatarErrorRefreshUsed = false;
      clearPreview();
      removeButton.hidden = false;
      let avatarUrl;
      try {
        avatarUrl = await getSignedAvatarUrl(newPath, user.id);
        savedAvatarUrl = avatarUrl;
        displayAvatar(avatarUrl);
      } catch {
        savedAvatarUrl = null;
        avatarErrorRefreshUsed = false;
        clearOwnAvatarUrl();
        displayAvatar(null);
        setStatus("Your picture was saved, but its preview couldn't be loaded. Refresh the page to try again.", "warning");
      }

      if (oldPath && oldPath !== newPath) {
        const cleanup = await removeOwnedAvatar(oldPath, user.id);
        if (cleanup.error || cleanup.skipped) {
          setStatus("Your new picture was saved, but the previous picture couldn't be safely removed.", "warning");
        } else if (profileStatus.dataset.state !== "warning") {
          setStatus("Your profile picture has been updated.", "success");
        }
      } else if (profileStatus.dataset.state !== "warning") {
        setStatus("Your profile picture has been updated.", "success");
      }
      broadcastProfileUpdate();
    } catch {
      setStatus("We couldn't upload that picture. Check your connection and try again.", "error");
    } finally {
      setBusy(false);
    }
  });

  removeButton.addEventListener("click", async () => {
    if (requestInProgress || !currentProfile?.avatar_path) return;
    const user = await getActiveUser();
    if (!user) return;

    const oldPath = currentProfile.avatar_path;
    setBusy(true, removeButton, "Removing…");
    setStatus("Removing your profile picture…");
    try {
      const result = await updateCurrentProfile({ avatar_path: null });
      if (!result) return;
      if (result.error) {
        setStatus("We couldn't remove your picture from your profile. Check your profile permissions, then try again.", "error");
        return;
      }

      savedAvatarUrl = null;
      clearOwnAvatarUrl();
      displayAvatar(null);
      removeButton.hidden = true;
      const cleanup = await removeOwnedAvatar(oldPath, user.id);
      if (cleanup.error || cleanup.skipped) {
        setStatus("Your picture was removed from your profile, but its stored file couldn't be safely deleted.", "warning");
      } else {
        setStatus("Your profile picture has been removed.", "success");
      }
      broadcastProfileUpdate();
    } catch {
      setStatus("We couldn't remove your picture. Check your connection and try again.", "error");
    } finally {
      setBusy(false);
    }
  });

  avatarImage.addEventListener("error", () => {
    if (previewUrl && avatarImage.getAttribute("src") === previewUrl) {
      clearPreview();
      setStatus("We couldn't preview that image. Choose a valid JPEG, PNG or WebP image.", "error");
      return;
    }
    if (
      savedAvatarUrl &&
      avatarImage.src === savedAvatarUrl &&
      !avatarErrorRefreshUsed &&
      currentUser &&
      currentProfile?.avatar_path
    ) {
      avatarErrorRefreshUsed = true;
      savedAvatarUrl = null;
      displayAvatar(null);
      const userId = currentUser.id;
      const path = currentProfile.avatar_path;
      void refreshOwnAvatarUrl(
        supabaseClient,
        userId,
        path,
      ).catch(() => {
        if (currentUser?.id === userId && currentProfile?.avatar_path === path) {
          setStatus("Your picture couldn't be refreshed. You can upload it again.", "warning");
        }
      });
      return;
    }
    savedAvatarUrl = null;
    clearOwnAvatarUrl();
    displayAvatar(null);
    setStatus("Your picture couldn't be displayed. Refresh the page or upload it again.", "warning");
  });

  avatarImage.addEventListener("load", () => {
    avatarErrorRefreshUsed = false;
    if (
      avatarImage.getAttribute("src") &&
      avatarImage.complete &&
      avatarImage.naturalWidth > 0
    ) {
      avatarPlaceholder.hidden = true;
    }
  });

  loadProfile();
}
