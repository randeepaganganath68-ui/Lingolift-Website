const SUPABASE_FUNCTION_URL =
  "https://zpujapkfegodxxdicwxa.supabase.co/functions/v1/contact-notification";
const CONTACT_ALLOWED_ORIGIN = "https://randeepaganganath68-ui.github.io";
const CONTACT_CORS_HEADERS = {
  "Access-Control-Allow-Origin": CONTACT_ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  Vary: "Origin",
};
const PREFLIGHT_VARY =
  "Origin, Access-Control-Request-Method, Access-Control-Request-Headers";
const MAX_BODY_BYTES = 10_000;

function jsonResponse(body, status, headers = {}) {
  return Response.json(body, {
    status,
    headers: { ...CONTACT_CORS_HEADERS, ...headers },
  });
}

async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return null;

  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isValidIpAddress(value) {
  return /^[0-9a-fA-F:.]{3,64}$/.test(value);
}

async function signRequest(secret, timestamp, clientIp, body) {
  const encoder = new TextEncoder();
  const prefix = encoder.encode(`${timestamp}\n${clientIp}\n`);
  const signedBytes = new Uint8Array(prefix.length + body.length);
  signedBytes.set(prefix);
  signedBytes.set(body, prefix.length);

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, signedBytes);
  return bytesToHex(new Uint8Array(signature));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      if (request.headers.get("origin") !== CONTACT_ALLOWED_ORIGIN) {
        return Response.json(
          { error: "This request is not allowed." },
          {
            status: 403,
            headers: {
              "Cache-Control": "no-store",
              Vary: request.method === "OPTIONS" ? PREFLIGHT_VARY : "Origin",
            },
          },
        );
      }

      if (request.method === "OPTIONS") {
        const requestedHeaders = request.headers.get("access-control-request-headers");
        const onlyContentTypeRequested = requestedHeaders !== null &&
          requestedHeaders.split(",").every((header) => header.trim().toLowerCase() === "content-type");
        if (
          request.headers.get("access-control-request-method") !== "POST" ||
          !onlyContentTypeRequested
        ) {
          return jsonResponse(
            { error: "This request is not allowed." },
            403,
            { Vary: PREFLIGHT_VARY },
          );
        }

        return new Response(null, {
          status: 204,
          headers: { ...CONTACT_CORS_HEADERS, Vary: PREFLIGHT_VARY },
        });
      }

      if (request.method !== "POST") {
        return jsonResponse(
          { error: "Method not allowed." },
          405,
          { Allow: "POST, OPTIONS" },
        );
      }

      const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim();
      if (contentType?.toLowerCase() !== "application/json") {
        return jsonResponse({ error: "A JSON request is required." }, 415);
      }

      const contentLength = Number(request.headers.get("content-length") ?? 0);
      if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
        return jsonResponse({ error: "The message is too large." }, 413);
      }

      if (
        !env.CONTACT_WORKER_HMAC_SECRET ||
        env.CONTACT_WORKER_HMAC_SECRET.length < 32 ||
        !env.SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_")
      ) {
        console.error("Contact forwarding is not configured.");
        return jsonResponse({ error: "The contact form is temporarily unavailable." }, 503);
      }

      const clientIp = request.headers.get("cf-connecting-ip")?.trim();
      if (!clientIp || !isValidIpAddress(clientIp)) {
        console.error("Cloudflare did not provide a usable client IP address.");
        return jsonResponse({ error: "The contact form is temporarily unavailable." }, 503);
      }

      let body;
      try {
        body = await readBody(request);
      } catch {
        return jsonResponse({ error: "The message could not be read." }, 400);
      }
      if (!body) {
        return jsonResponse({ error: "The message is too large or could not be read." }, 413);
      }

      const timestamp = Math.floor(Date.now() / 1000).toString();
      let signature;
      try {
        signature = await signRequest(
          env.CONTACT_WORKER_HMAC_SECRET,
          timestamp,
          clientIp,
          body,
        );
      } catch {
        console.error("Contact request signing failed.");
        return jsonResponse({ error: "The contact form is temporarily unavailable." }, 503);
      }

      const headers = new Headers({
        "Content-Type": "application/json",
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        "X-Contact-Timestamp": timestamp,
        "X-Contact-Client-IP": clientIp,
        "X-Contact-Signature": signature,
      });
      const origin = request.headers.get("origin");
      if (origin) headers.set("Origin", origin);

      let upstreamResponse;
      try {
        upstreamResponse = await fetch(SUPABASE_FUNCTION_URL, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        console.error("Supabase contact function request failed.");
        return jsonResponse({ error: "Your message could not be sent. Please try again later." }, 502);
      }

      let upstreamBody;
      try {
        upstreamBody = await upstreamResponse.json();
      } catch {
        console.error("Supabase contact function returned an unreadable response.");
        return jsonResponse({ error: "Your message could not be sent. Please try again later." }, 502);
      }

      if (upstreamResponse.ok && upstreamBody?.ok === true) {
        return jsonResponse({ ok: true }, 200);
      }
      if (upstreamResponse.status === 400 || upstreamResponse.status === 429) {
        return jsonResponse(
          { error: upstreamBody.error ?? "Your message could not be processed." },
          upstreamResponse.status,
        );
      }

      console.error("Supabase contact function rejected the request.", upstreamResponse.status);
      return jsonResponse(
        { error: "Your message could not be sent. Please try again later." },
        upstreamResponse.status >= 500 ? upstreamResponse.status : 502,
      );
    }

    return env.ASSETS.fetch(request);
  },
};
