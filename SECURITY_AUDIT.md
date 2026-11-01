# Lingolift Website Security Audit

**Scope:** Static HTML, CSS, vanilla JavaScript, the contact form, visual assets, SEO resources, and project/deployment files in this repository. No external systems were tested.  
**Assessment:** Frontend-only static website; no application server, account system, database, or form-processing endpoint is present.

## Summary

No confirmed exploitable XSS, unsafe dynamic HTML, JavaScript evaluation, exposed credentials, remote scripts, iframe embeds, or secret-bearing configuration were found in the reviewed project.

The main actionable hardening gap was the absence of deployment security-header configuration. The contact form also lacked maximum input lengths and would have used the browser's default GET method if JavaScript did not run. Both have been addressed in the source/configuration.

## Findings and changes

| # | Severity | Finding | Resolution / recommendation |
|---|---|---|---|
| 1 | Medium | No CSP or browser security-header configuration was present in the project. Effective response headers therefore depended on the unknown host. | Added matching Vercel (`vercel.json`) and Netlify (`_headers`) examples. They set a restrictive CSP and standard security headers. They are **not verified active** until deployed and checked in the production response. |
| 2 | Low | The contact form had no maximum lengths, and the default form method could put entered values in the URL if its JavaScript handler failed to run. | Added POST method, browser length limits, explicit client validation, a fixed allowed-topic list, and accessible error descriptions. The submit button stays disabled unless the client-side handler loads. The form still does not submit or store data. |
| 3 | Low | The future Google Play URL was assigned to a link without checking the destination. | Added a protocol/host/path allowlist requiring the official HTTPS Google Play app-listing URL before opening the link in a new tab; `noopener noreferrer` is set. No store URL is currently configured. |
| 4 | Informational | Google Fonts are a third-party stylesheet and font dependency. SRI is not reliably applicable to the dynamically served Google Fonts CSS response. | Kept the existing visual font design. CSP permits only `fonts.googleapis.com` for styles and `fonts.gstatic.com` for fonts; no third-party JavaScript is allowed. Self-host the fonts if eliminating this third party is a future requirement. |
| 5 | Informational | The form is frontend-only. Client-side checks can be bypassed and do not deliver or securely retain a message. | The UI explicitly says the demo does not send or store information. If a backend is added, validate and constrain all fields server-side, apply abuse controls, and use an established secure delivery path. |
| 6 | Informational | Canonical, sitemap, and structured-data URLs still use `lingolift.example`. | Replace the reserved placeholder with the verified production domain before launch. The actual domain was not provided, so it was not guessed. |

## Code review

- JavaScript uses `textContent` for dynamic messages and the year. No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, `new Function`, URL-parameter execution, inline event handlers, or debug logging was found.
- No API keys, passwords, private tokens, source maps, or backend credentials were found in the project files. The frontend store-link setting is an empty public URL placeholder, not a credential.
- Internal navigation uses relative URLs. The only configured external resource is Google Fonts over HTTPS. No external JavaScript, icon library, iframe, or embedded content was found.
- The Google Play link opens a new tab only after URL validation and uses `rel="noopener noreferrer"`.
- Contact errors are fixed application-authored text written with `textContent`; user values are not reflected into the page. Name and email autocomplete remain enabled.
- The supplied logo is a local PNG; other visual artwork is local. No user-controlled redirect or browser permission request is present.

## Content Security Policy

The hosting configurations use:

```text
default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self'; connect-src 'self'; frame-src 'none'; frame-ancestors 'none'; form-action 'self'; manifest-src 'self'; worker-src 'self'; upgrade-insecure-requests
```

The policy disallows inline/eval scripts, plugin content, frames, and unapproved origins while retaining the existing local scripts/styles/images and Google Fonts. JSON-LD blocks use the `application/ld+json` data type and are not executable JavaScript. No CSP meta element was added: the production HTTP response header is preferred.

The repository includes both `vercel.json` and Netlify `_headers` as **alternative host examples** because the production host is unknown. Use and verify the configuration for the actual host. Before enforcing CSP on a deployment, test the same policy in `Content-Security-Policy-Report-Only` response headers on a staging deployment, inspect browser violations and required pages/features, then enforce it. The policy has not been claimed active or verified on a deployed site.

## Security headers configured for hosting

- `Content-Security-Policy`: restrictive source allowlist, no inline/eval scripts, no objects or frames.
- `Strict-Transport-Security`: one-year HSTS with subdomains. Keep it only when HTTPS is available for the domain and **all** subdomains; begin with a shorter `max-age` if HTTPS readiness is uncertain. Do not opt into preload without a separate domain-wide readiness review.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `X-Frame-Options: DENY`, alongside CSP `frame-ancestors 'none'`.
- `Permissions-Policy` disables unused camera, microphone, geolocation, payment, and USB capabilities.

## Verification

- Passed `node --check` for both JavaScript files.
- Parsed all 11 HTML files and `vercel.json`; checked each page's title, description, canonical URL, H1, local image/icon paths, image alt attributes, form method, inline event handlers, and iframe usage.
- Checked all 237 local navigation/article links and resource references for missing paths; no broken local targets were found.
- All 11 pages returned HTTP 200 on the local server.
- Tested responsive widths of 320, 375, 768, 1024, and 1440 pixels on all 11 pages; no horizontal overflow remained. Fixed a narrow-screen overflow found in the feature illustrations during this test.
- Browser-tested the mobile menu and the contact form's empty, valid, over-length, and HTML-payload cases. The submitted test payload was not reflected as markup, and the form made no POST request.
- Tested the proposed CSP as a local `Content-Security-Policy-Report-Only` response header across all pages: zero CSP violations and zero JavaScript page errors. Report-only testing does not prove that the production host will send the policy or that enforcement is active.
- Confirmed the Vercel JSON is valid and the Netlify `_headers` values match the same policy.
- After deployment, inspect real response headers on the homepage, an article, the contact page, and static assets; confirm HTTPS/HSTS behavior and verify browser console/network errors. A local static-server test cannot establish production header behavior.

## Deployment checklist

- [ ] Replace every `lingolift.example` canonical, Open Graph, JSON-LD, `robots.txt`, and sitemap URL with the production domain.
- [ ] Choose the correct provider configuration; do not assume both hosting examples are active.
- [ ] Verify CSP in report-only mode on staging; then enable and verify enforced CSP.
- [ ] Check CSP allows only required resources and blocks inline/eval scripts and framing.
- [ ] Verify HTTPS redirects and HSTS; ensure every subdomain is HTTPS-ready before using `includeSubDomains`.
- [ ] Verify `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, and `Permissions-Policy` in deployed responses.
- [ ] Verify page, article, image, stylesheet, script, robots, and sitemap responses have expected status and content types.
- [ ] Check the contact form clearly remains non-submitting until a real backend is intentionally implemented.
- [ ] If adding form processing, validate on the server, impose request/body limits, protect against spam/abuse, and document retention/privacy.
- [ ] Configure the Play Store URL only after the official listing is published; keep the HTTPS Google Play URL validation.
- [ ] Re-run link, mobile, browser-console, and CSP checks against the production site.

## Limitations

This review covers the files present in this static project and does not certify the hosting account, DNS, TLS configuration, CDN, deployment pipeline, third-party font service, or future changes. Client-side validation is not a security boundary. Security headers are only effective when the selected host serves them in HTTP responses.
