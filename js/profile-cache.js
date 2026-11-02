"use strict";

let activeSupabase = null;
let activeUserId = null;
let cachedProfile = null;
let pendingProfile = null;
let profileVersion = 0;

function selectProfileClient(supabase, userId) {
  if (activeSupabase === supabase && activeUserId === userId) return;
  activeSupabase = supabase;
  activeUserId = userId;
  cachedProfile = null;
  pendingProfile = null;
  profileVersion += 1;
}

export async function getOwnProfile(supabase, userId) {
  selectProfileClient(supabase, userId);
  if (cachedProfile) return cachedProfile;
  if (pendingProfile) return pendingProfile.promise;

  const version = profileVersion;
  const promise = (async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name, avatar_path, updated_at")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (
      activeSupabase !== supabase ||
      activeUserId !== userId ||
      profileVersion !== version
    ) {
      return null;
    }
    cachedProfile = data;
    return data;
  })();
  pendingProfile = { promise, version };

  try {
    return await promise;
  } finally {
    if (pendingProfile?.promise === promise) pendingProfile = null;
  }
}

export function setOwnProfile(supabase, userId, profile) {
  selectProfileClient(supabase, userId);
  profileVersion += 1;
  cachedProfile = profile;
  pendingProfile = null;
}

export function clearOwnProfile(userId = null) {
  if (userId && activeUserId !== userId) return;
  activeSupabase = null;
  activeUserId = null;
  cachedProfile = null;
  pendingProfile = null;
  profileVersion += 1;
}
