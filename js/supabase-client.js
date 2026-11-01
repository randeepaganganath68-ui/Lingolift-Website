import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm";

const SUPABASE_URL = "https://zpujapkfegodxxdicwxa.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_LeIqqKFROmdtzxu9HCEHzA_EqpmwGpw";

const isConfigured =
  !SUPABASE_URL.includes("YOUR_SUPABASE_PROJECT_URL") &&
  !SUPABASE_PUBLISHABLE_KEY.includes("YOUR_SUPABASE_PUBLISHABLE_KEY");

function getValidatedConfig() {
  const projectUrl = new URL(SUPABASE_URL);
  if (
    projectUrl.protocol !== "https:" ||
    !projectUrl.hostname.endsWith(".supabase.co") ||
    projectUrl.pathname !== "/" ||
    projectUrl.search ||
    projectUrl.hash ||
    projectUrl.username ||
    projectUrl.password
  ) {
    throw new Error("SUPABASE_URL must be an HTTPS Supabase project URL.");
  }

  if (!SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")) {
    throw new Error(
      "Use a Supabase publishable key; secret and service-role keys are not allowed in browser code.",
    );
  }

  return { projectUrl: projectUrl.origin, publishableKey: SUPABASE_PUBLISHABLE_KEY };
}

const config = isConfigured ? getValidatedConfig() : null;

export const supabase = config
  ? createClient(config.projectUrl, config.publishableKey)
  : null;

export async function verifySupabaseConnection() {
  if (!config) {
    throw new Error(
      "Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in js/supabase-client.js first.",
    );
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 10000);
  let response;
  try {
    response = await fetch(`${config.projectUrl}/auth/v1/settings`, {
      headers: { apikey: config.publishableKey },
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error("Supabase Auth connection could not be verified.");
  }

  return { connected: true, status: response.status };
}
