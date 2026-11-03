"use strict";

const pendingAvatarStorageKey = "lingolift:pending-signup-avatar";
const maxPendingAvatarAgeMs = 7 * 24 * 60 * 60 * 1000;
const maxAvatarFileSize = 2 * 1024 * 1024;
const maxAvatarPixelCount = 20_000_000;
const cropOutputSize = 384;
const maxPendingAvatarBytes = 250 * 1024;
const avatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function createSignupAvatarEditor(form) {
  const fileInput = form.querySelector("[data-signup-avatar-file]");
  const editor = form.querySelector("[data-signup-avatar-editor]");
  const viewport = form.querySelector("[data-avatar-crop-viewport]");
  const previewImage = form.querySelector("[data-avatar-crop-image]");
  const zoomInput = form.querySelector("[data-avatar-crop-zoom]");
  const clearButton = form.querySelector("[data-avatar-crop-clear]");
  const status = form.querySelector("[data-signup-avatar-status]");

  if (
    !(fileInput instanceof HTMLInputElement) ||
    !(editor instanceof HTMLElement) ||
    !(viewport instanceof HTMLElement) ||
    !(previewImage instanceof HTMLImageElement) ||
    !(zoomInput instanceof HTMLInputElement) ||
    !(clearButton instanceof HTMLButtonElement) ||
    !(status instanceof HTMLElement)
  ) {
    throw new Error("Signup form is missing its profile-picture controls.");
  }

  let objectUrl = null;
  let imageReady = false;
  let baseScale = 1;
  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragStart = null;

  function setStatus(message, state = "info") {
    status.textContent = message;
    status.dataset.state = state;
  }

  function releaseImage() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    imageReady = false;
    previewImage.removeAttribute("src");
    editor.hidden = true;
    zoomInput.value = "1";
    offsetX = 0;
    offsetY = 0;
    dragStart = null;
  }

  function clampOffsets(width, height) {
    const displayedWidth = previewImage.naturalWidth * baseScale * zoom;
    const displayedHeight = previewImage.naturalHeight * baseScale * zoom;
    offsetX = Math.min(0, Math.max(width - displayedWidth, offsetX));
    offsetY = Math.min(0, Math.max(height - displayedHeight, offsetY));
  }

  function renderCrop() {
    if (!imageReady) return;
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    if (!width || !height) return;
    clampOffsets(width, height);
    previewImage.style.width = `${previewImage.naturalWidth * baseScale * zoom}px`;
    previewImage.style.height = `${previewImage.naturalHeight * baseScale * zoom}px`;
    previewImage.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  }

  function clearSelection(message = "") {
    releaseImage();
    fileInput.value = "";
    setStatus(message);
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) {
      clearSelection();
      return;
    }
    if (!avatarTypes.has(file.type)) {
      clearSelection("Choose a JPEG, PNG or WebP picture.");
      setStatus("Choose a JPEG, PNG or WebP picture.", "error");
      return;
    }
    if (!file.size || file.size > maxAvatarFileSize) {
      clearSelection("Choose a picture no larger than 2 MB.");
      setStatus("Choose a picture larger than 0 bytes and no larger than 2 MB.", "error");
      return;
    }

    releaseImage();
    editor.hidden = false;
    objectUrl = URL.createObjectURL(file);
    previewImage.onload = () => {
      const pixelCount = previewImage.naturalWidth * previewImage.naturalHeight;
      if (!previewImage.naturalWidth || !previewImage.naturalHeight || pixelCount > maxAvatarPixelCount) {
        clearSelection("Choose a smaller image.");
        setStatus("This picture is too large to crop. Choose an image with smaller dimensions.", "error");
        return;
      }
      imageReady = true;
      zoom = 1;
      zoomInput.value = "1";
      const size = viewport.clientWidth;
      baseScale = Math.max(size / previewImage.naturalWidth, size / previewImage.naturalHeight);
      offsetX = (size - previewImage.naturalWidth * baseScale) / 2;
      offsetY = (size - previewImage.naturalHeight * baseScale) / 2;
      renderCrop();
      setStatus("Picture ready. Drag it to adjust the crop, or use the zoom slider.", "success");
    };
    previewImage.onerror = () => {
      clearSelection("We couldn't read that picture. Choose a valid JPEG, PNG or WebP image.");
      setStatus("We couldn't read that picture. Choose a valid JPEG, PNG or WebP image.", "error");
    };
    previewImage.src = objectUrl;
  });

  zoomInput.addEventListener("input", () => {
    if (!imageReady) return;
    const oldZoom = zoom;
    zoom = Number(zoomInput.value);
    const centerX = viewport.clientWidth / 2;
    const centerY = viewport.clientHeight / 2;
    offsetX = centerX - (centerX - offsetX) * (zoom / oldZoom);
    offsetY = centerY - (centerY - offsetY) * (zoom / oldZoom);
    renderCrop();
  });

  viewport.addEventListener("pointerdown", (event) => {
    if (!imageReady) return;
    event.preventDefault();
    viewport.setPointerCapture(event.pointerId);
    dragStart = { x: event.clientX, y: event.clientY, offsetX, offsetY };
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!dragStart) return;
    offsetX = dragStart.offsetX + event.clientX - dragStart.x;
    offsetY = dragStart.offsetY + event.clientY - dragStart.y;
    renderCrop();
  });
  viewport.addEventListener("pointerup", () => {
    dragStart = null;
  });
  viewport.addEventListener("pointercancel", () => {
    dragStart = null;
  });
  clearButton.addEventListener("click", () => clearSelection());
  window.addEventListener("resize", renderCrop);

  return {
    get hasImage() {
      return imageReady;
    },
    async createCroppedAvatar() {
      if (!imageReady) return null;
      renderCrop();
      const cropScale = baseScale * zoom;
      const sourceSize = viewport.clientWidth / cropScale;
      const sourceX = -offsetX / cropScale;
      const sourceY = -offsetY / cropScale;
      const canvas = document.createElement("canvas");
      canvas.width = cropOutputSize;
      canvas.height = cropOutputSize;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The browser could not prepare the profile picture.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, cropOutputSize, cropOutputSize);
      context.drawImage(
        previewImage,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        cropOutputSize,
        cropOutputSize,
      );
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (result) => result ? resolve(result) : reject(new Error("The cropped picture could not be created.")),
          "image/jpeg",
          0.84,
        );
      });
      if (blob.size > maxPendingAvatarBytes) {
        throw new Error("The cropped picture is too large to save. Choose a simpler or smaller image.");
      }
      return blob;
    },
    clear: clearSelection,
    dispose() {
      releaseImage();
      window.removeEventListener("resize", renderCrop);
    },
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("The cropped picture couldn't be saved in this browser."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("The cropped picture couldn't be saved in this browser."));
    reader.readAsDataURL(blob);
  });
}

export async function savePendingSignupAvatar(email, blob) {
  if (
    typeof email !== "string" ||
    !email.trim() ||
    !(blob instanceof Blob) ||
    blob.type !== "image/jpeg" ||
    !blob.size ||
    blob.size > maxPendingAvatarBytes
  ) {
    return { ok: false };
  }
  try {
    const dataUrl = await blobToDataUrl(blob);
    window.localStorage.setItem(
      pendingAvatarStorageKey,
      JSON.stringify({
        email: email.trim().toLowerCase(),
        createdAt: Date.now(),
        dataUrl,
      }),
    );
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function applyPendingSignupAvatar(supabase, user) {
  let pending;
  try {
    const savedValue = window.localStorage.getItem(pendingAvatarStorageKey);
    if (!savedValue) return { status: "none" };
    pending = JSON.parse(savedValue);
  } catch {
    return { status: "failed", message: "Your saved signup picture couldn't be read. You can upload it from profile settings." };
  }

  if (
    typeof pending?.email !== "string" ||
    typeof user?.email !== "string" ||
    pending.email !== user.email.trim().toLowerCase()
  ) {
    return { status: "none" };
  }
  if (
    !Number.isFinite(pending.createdAt) ||
    Date.now() - pending.createdAt > maxPendingAvatarAgeMs ||
    typeof pending.dataUrl !== "string" ||
    !pending.dataUrl.startsWith("data:image/jpeg;base64,")
  ) {
    try {
      window.localStorage.removeItem(pendingAvatarStorageKey);
    } catch {
      return { status: "failed", message: "Your expired signup picture couldn't be cleared from this browser." };
    }
    return { status: "none" };
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, avatar_path")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError || !profile) {
      return { status: "failed", message: "Your account is ready, but the signup picture couldn't be saved. You can upload it from profile settings." };
    }
    if (profile.avatar_path) {
      window.localStorage.removeItem(pendingAvatarStorageKey);
      return { status: "kept-existing" };
    }

    const base64 = pending.dataUrl.slice("data:image/jpeg;base64,".length);
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (!bytes.length || bytes.length > maxPendingAvatarBytes) {
      return { status: "failed", message: "Your signup picture couldn't be saved. You can upload it from profile settings." };
    }
    const blob = new Blob([bytes], { type: "image/jpeg" });
    const avatarPath = `${user.id}/avatar.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(avatarPath, blob, {
        cacheControl: "300",
        contentType: "image/jpeg",
        upsert: true,
      });
    if (uploadError) {
      return { status: "failed", message: "Your account is ready, but the signup picture couldn't be uploaded. You can add it from profile settings." };
    }

    const { data: updatedProfile, error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_path: avatarPath, updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .select("full_name, avatar_path, updated_at")
      .single();
    if (updateError || !updatedProfile) {
      const { error: cleanupError } = await supabase.storage.from("avatars").remove([avatarPath]);
      return {
        status: "failed",
        message: cleanupError
          ? "Your account is ready, but the picture couldn't be linked to your profile or cleaned up. You can upload it from profile settings."
          : "Your account is ready, but the signup picture couldn't be linked to your profile. You can upload it from profile settings.",
      };
    }

    window.localStorage.removeItem(pendingAvatarStorageKey);
    const [{ setOwnProfile }, { getOwnAvatarUrl }] = await Promise.all([
      import("./profile-cache.js"),
      import("./avatar-signed-url.js"),
    ]);
    setOwnProfile(supabase, user.id, updatedProfile);
    document.dispatchEvent(
      new CustomEvent("lingolift:profile-updated", {
        detail: {
          userId: user.id,
          fullName: updatedProfile.full_name || user.user_metadata?.full_name || "",
          avatarPath,
        },
      }),
    );
    try {
      await getOwnAvatarUrl(supabase, user.id, avatarPath);
    } catch {
      return { status: "uploaded", message: "Your picture was saved. Its preview will appear after you refresh your profile." };
    }
    return { status: "uploaded", message: "Your signup picture has been added to your profile." };
  } catch {
    return { status: "failed", message: "Your signup picture couldn't be saved. You can upload it from profile settings." };
  }
}
