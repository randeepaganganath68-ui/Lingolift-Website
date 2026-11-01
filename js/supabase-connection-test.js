const status = document.querySelector("#connection-status");
const testButton = document.querySelector("#test-connection");
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

if (!(status instanceof HTMLElement) || !(testButton instanceof HTMLButtonElement)) {
  throw new Error("Supabase connection test page is missing required elements.");
}

if (!localHosts.has(window.location.hostname)) {
  status.textContent = "This test page is available only on a local development server.";
  testButton.disabled = true;
} else {
  testButton.addEventListener("click", async () => {
    testButton.disabled = true;
    status.textContent = "Checking the Supabase connection...";

    try {
      const { verifySupabaseConnection } = await import("./supabase-client.js");
      await verifySupabaseConnection();
      status.textContent = "Connection successful. The website can reach Supabase.";
    } catch {
      status.textContent =
        "Connection failed. Check the browser network connection and Supabase project configuration.";
      testButton.disabled = false;
    }
  });
}
