const SUBJECTS: Record<string, string> = {
  question: "Question about the app",
  feedback: "Feedback or suggestion",
  other: "Other",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
};

type ContactMessage = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

type ContactConfig = {
  allowedOrigin: string;
  adminEmail: string;
  fromEmail: string;
  resendApiKey: string;
  rateLimitSalt: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  workerHmacSecret: string;
};

type JsonBodyResult =
  | { kind: "ok"; value: Uint8Array }
  | { kind: "invalid" }
  | { kind: "too-large" };

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin?: string,
): Response {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...CORS_HEADERS,
  });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(JSON.stringify(body), { status, headers });
}

function readConfig(): ContactConfig | null {
  const configuredOrigin = Deno.env.get("CONTACT_ALLOWED_ORIGIN");
  const adminEmail = Deno.env.get("CONTACT_ADMIN_EMAIL");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const rateLimitSalt = Deno.env.get("CONTACT_RATE_LIMIT_SALT");
  const configuredSupabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const workerHmacSecret = Deno.env.get("CONTACT_WORKER_HMAC_SECRET");

  if (
    !configuredOrigin ||
    !adminEmail ||
    !fromEmail ||
    !resendApiKey ||
    !rateLimitSalt ||
    rateLimitSalt.length < 32 ||
    !configuredSupabaseUrl ||
    !serviceRoleKey ||
    !workerHmacSecret ||
    workerHmacSecret.length < 32
  ) {
    return null;
  }

  let allowedOrigin: string;
  let supabaseUrl: URL;
  try {
    const originUrl = new URL(configuredOrigin);
    supabaseUrl = new URL(configuredSupabaseUrl);
    if (
      originUrl.protocol !== "https:" ||
      originUrl.origin !== configuredOrigin ||
      originUrl.username ||
      originUrl.password ||
      supabaseUrl.protocol !== "https:" ||
      !supabaseUrl.hostname.endsWith(".supabase.co") ||
      supabaseUrl.username ||
      supabaseUrl.password
    ) {
      return null;
    }
    allowedOrigin = originUrl.origin;
  } catch {
    return null;
  }

  if (
    !isValidEmail(adminEmail) ||
    fromEmail.length > 254 ||
    /[\r\n]/.test(fromEmail) ||
    !/^(?:[^<>\r\n]{1,100}\s*<[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>|[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+)$/.test(
      fromEmail,
    )
  ) {
    return null;
  }

  return {
    allowedOrigin,
    adminEmail,
    fromEmail,
    resendApiKey,
    rateLimitSalt,
    supabaseUrl: supabaseUrl.origin,
    serviceRoleKey,
    workerHmacSecret,
  };
}

function isValidEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sanitizeSingleLine(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
}

function sanitizeMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

function parseContactMessage(value: unknown): ContactMessage | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const name = sanitizeSingleLine(record.name);
  const email = sanitizeSingleLine(record.email);
  const subject = sanitizeSingleLine(record.subject);
  const message = sanitizeMessage(record.message);

  if (
    !name ||
    name.length < 2 ||
    name.length > 80 ||
    !email ||
    !isValidEmail(email) ||
    !subject ||
    !Object.hasOwn(SUBJECTS, subject) ||
    !message ||
    message.length < 10 ||
    message.length > 2000
  ) {
    return null;
  }

  return { name, email, subject, message };
}

async function readRawBody(request: Request): Promise<JsonBodyResult> {
  const reader = request.body?.getReader();
  if (!reader) return { kind: "invalid" };

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > 10_000) {
        await reader.cancel();
        return { kind: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return { kind: "invalid" };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { kind: "ok", value: bytes };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function getSignedClientIp(request: Request): string | null {
  const clientIp = request.headers.get("x-contact-client-ip")?.trim();
  return clientIp && isValidIpAddress(clientIp) ? clientIp : null;
}

function isValidIpAddress(value: string): boolean {
  const ipv4Parts = value.split(".");
  if (
    ipv4Parts.length === 4 &&
    ipv4Parts.every((part) =>
      /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255
    )
  ) {
    return true;
  }

  if (!value.includes(":") || value.length > 64) return false;
  try {
    const url = new URL(`http://[${value}]/`);
    return url.hostname.startsWith("[") && url.hostname.endsWith("]");
  } catch {
    return false;
  }
}

function hexToBytes(value: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function verifyWorkerSignature(
  secret: string,
  timestamp: string | null,
  signature: string | null,
  clientIp: string | null,
  rawBody: Uint8Array,
): Promise<boolean> {
  if (
    !timestamp ||
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300 ||
    !signature ||
    !clientIp
  ) {
    return false;
  }

  const signatureBytes = hexToBytes(signature);
  if (!signatureBytes) return false;

  const encoder = new TextEncoder();
  const prefix = encoder.encode(`${timestamp}\n${clientIp}\n`);
  const signedBytes = new Uint8Array(prefix.length + rawBody.length);
  signedBytes.set(prefix);
  signedBytes.set(rawBody, prefix.length);
  const signatureBuffer = new ArrayBuffer(signatureBytes.byteLength);
  new Uint8Array(signatureBuffer).set(signatureBytes);
  const signedBuffer = new ArrayBuffer(signedBytes.byteLength);
  new Uint8Array(signedBuffer).set(signedBytes);

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify("HMAC", key, signatureBuffer, signedBuffer);
  } catch {
    return false;
  }
}

async function hashClientIp(ip: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function consumeRateLimit(config: ContactConfig, ipHash: string): Promise<boolean> {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/consume_contact_rate_limit`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_ip_hash: ipHash }),
  });

  if (!response.ok) {
    console.error("Contact rate-limit service returned an error.", response.status);
    throw new Error("Contact rate-limit service unavailable.");
  }

  return await response.json() === true;
}

function buildEmail(message: ContactMessage, submittedAt: Date): { html: string; text: string } {
  const escapedName = escapeHtml(message.name);
  const escapedEmail = escapeHtml(message.email);
  const escapedSubject = escapeHtml(SUBJECTS[message.subject]);
  const escapedMessage = escapeHtml(message.message).replace(/\n/g, "<br>");
  const timestamp = submittedAt.toISOString();

  return {
    html: `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>New Contact Message – Lingolift</title></head>
  <body style="margin:0;padding:24px;background:#f5f7f3;font-family:Arial,sans-serif;color:#263328;">
    <main style="max-width:640px;margin:0 auto;padding:28px;background:#ffffff;border:1px solid #e2e8de;">
      <h1 style="margin:0 0 24px;color:#245b37;font-size:22px;">New Contact Message – Lingolift</h1>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><th align="left" style="padding:10px 0;color:#58645a;">Name</th><td style="padding:10px 0;">${escapedName}</td></tr>
        <tr><th align="left" style="padding:10px 0;color:#58645a;">Email</th><td style="padding:10px 0;"><a href="mailto:${escapedEmail}" style="color:#245b37;">${escapedEmail}</a></td></tr>
        <tr><th align="left" style="padding:10px 0;color:#58645a;">Subject</th><td style="padding:10px 0;">${escapedSubject}</td></tr>
        <tr><th align="left" style="padding:10px 0;color:#58645a;">Submitted (UTC)</th><td style="padding:10px 0;">${timestamp}</td></tr>
      </table>
      <h2 style="margin:22px 0 8px;font-size:16px;">Message</h2>
      <p style="margin:0;line-height:1.6;overflow-wrap:anywhere;">${escapedMessage}</p>
    </main>
  </body>
</html>`,
    text: [
      "New Contact Message – Lingolift",
      "",
      `Name: ${message.name}`,
      `Email: ${message.email}`,
      `Subject: ${SUBJECTS[message.subject]}`,
      `Submitted (UTC): ${timestamp}`,
      "",
      "Message:",
      message.message,
    ].join("\n"),
  };
}

Deno.serve(async (request: Request): Promise<Response> => {
  const config = readConfig();
  if (!config) {
    console.error("Contact notification configuration is missing or invalid.");
    return jsonResponse({ error: "The contact form is temporarily unavailable." }, 503);
  }

  const origin = request.headers.get("origin");
  if (origin !== config.allowedOrigin) {
    return jsonResponse({ error: "This request is not allowed." }, 403);
  }

  if (request.method === "OPTIONS") {
    const requestedMethod = request.headers.get("access-control-request-method");
    const requestedHeaders = request.headers.get("access-control-request-headers");
    const requestedHeaderNames = requestedHeaders
      ?.split(",")
      .map((header) => header.trim().toLowerCase());
    if (
      requestedMethod !== "POST" ||
      !requestedHeaderNames ||
      requestedHeaderNames.length !== 1 ||
      requestedHeaderNames[0] !== "content-type"
    ) {
      return jsonResponse({ error: "This request is not allowed." }, 403, config.allowedOrigin);
    }

    return new Response(null, {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        "Access-Control-Allow-Origin": config.allowedOrigin,
      },
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, config.allowedOrigin);
  }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return jsonResponse({ error: "A JSON request is required." }, 415, config.allowedOrigin);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 10_000) {
    return jsonResponse({ error: "The message is too large." }, 413, config.allowedOrigin);
  }

  const rawBodyResult = await readRawBody(request);
  if (rawBodyResult.kind === "too-large") {
    return jsonResponse({ error: "The message is too large." }, 413, config.allowedOrigin);
  }
  if (rawBodyResult.kind === "invalid") {
    return jsonResponse({ error: "The message could not be read." }, 400, config.allowedOrigin);
  }
  const rawBody = rawBodyResult.value;
  const signedClientIp = getSignedClientIp(request);
  const signatureValid = await verifyWorkerSignature(
    config.workerHmacSecret,
    request.headers.get("x-contact-timestamp"),
    request.headers.get("x-contact-signature"),
    signedClientIp,
    rawBody,
  );
  if (!signatureValid) {
    return jsonResponse({ error: "This request is not authorized." }, 401, config.allowedOrigin);
  }

  let requestBody: unknown;
  try {
    requestBody = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return jsonResponse({ error: "The message could not be read." }, 400, config.allowedOrigin);
  }

  if (
    typeof requestBody === "object" &&
    requestBody !== null &&
    "website" in requestBody &&
    requestBody.website !== ""
  ) {
    return jsonResponse({ error: "The message could not be processed." }, 400, config.allowedOrigin);
  }

  const message = parseContactMessage(requestBody);
  if (!message) {
    return jsonResponse({ error: "Please check your contact details and try again." }, 400, config.allowedOrigin);
  }

  const clientIp = signedClientIp;
  if (!clientIp) {
    console.error("Contact request did not include a usable client IP address.");
    return jsonResponse({ error: "The contact form is temporarily unavailable." }, 503, config.allowedOrigin);
  }

  let rateLimitAllowed: boolean;
  try {
    rateLimitAllowed = await consumeRateLimit(
      config,
      await hashClientIp(clientIp, config.rateLimitSalt),
    );
  } catch {
    return jsonResponse({ error: "The contact form is temporarily unavailable." }, 503, config.allowedOrigin);
  }
  if (!rateLimitAllowed) {
    return jsonResponse({ error: "Please wait before sending another message." }, 429, config.allowedOrigin);
  }

  const submittedAt = new Date();
  const email = buildEmail(message, submittedAt);
  let resendResponse: Response;
  try {
    resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.fromEmail,
        to: [config.adminEmail],
        reply_to: message.email,
        subject: `New Contact Message – Lingolift: ${SUBJECTS[message.subject]}`,
        html: email.html,
        text: email.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    console.error("Resend request failed before confirming acceptance.");
    return jsonResponse({ error: "Your message could not be sent. Please try again later." }, 502, config.allowedOrigin);
  }

  if (!resendResponse.ok) {
    console.error("Resend rejected the contact notification.", resendResponse.status);
    return jsonResponse({ error: "Your message could not be sent. Please try again later." }, 502, config.allowedOrigin);
  }

  let resendResult: unknown;
  try {
    resendResult = await resendResponse.json();
  } catch {
    console.error("Resend returned an unreadable response.");
    return jsonResponse({ error: "Your message could not be sent. Please try again later." }, 502, config.allowedOrigin);
  }

  if (
    typeof resendResult !== "object" ||
    resendResult === null ||
    !("id" in resendResult) ||
    typeof resendResult.id !== "string" ||
    !resendResult.id
  ) {
    console.error("Resend response did not confirm message acceptance.");
    return jsonResponse({ error: "Your message could not be sent. Please try again later." }, 502, config.allowedOrigin);
  }

  return jsonResponse({ ok: true }, 200, config.allowedOrigin);
});
