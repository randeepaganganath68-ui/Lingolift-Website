# Lingolift Website Security Audit

**Scope:** Static HTML, CSS, vanilla JavaScript, the contact form, visual assets, SEO resources, Git working tree and available local commit history, dependencies, and deployment/CI files. No external systems were tested.
**Assessment:** Frontend-only static website; no application server, account system, database, or form-processing endpoint is present.

## Summary

No confirmed exploitable XSS, unsafe dynamic HTML, JavaScript evaluation, exposed credentials, unexpected remote scripts loaded by the current pages, iframe embeds, or secret-bearing configuration were found in the reviewed project.

The initial audit's contact form and security-header findings have been hardened in the source/configuration. This follow-up adds repeatable CI checks, a branded not-found page, static sign-up/login page previews, and a reusable Supabase client configuration. The production domain and hosting account are still unknown, so production headers, deployment behavior, Supabase connectivity, and GitHub account-level security settings remain unverified.

## Findings and changes

| # | Severity | Finding | Resolution / recommendation |
|---|---|---|---|
| 1 | Medium | No CSP or browser security-header configuration was present in the project. Effective response headers therefore depended on the unknown host. | Added matching Vercel (`vercel.json`) and Netlify (`_headers`) examples. They set a restrictive CSP and standard security headers. They are **not verified active** until deployed and checked in the production response. |
| 2 | Low | The contact form had no maximum lengths, and the default form method could put entered values in the URL if its JavaScript handler failed to run. | Added POST method, browser length limits, explicit client validation, a fixed allowed-topic list, and accessible error descriptions. The submit button stays disabled unless the client-side handler loads. The form still does not submit or store data. |
| 3 | Low | The future Google Play URL was assigned to a link without checking the destination. | Added a protocol/host/path allowlist requiring the official HTTPS Google Play app-listing URL before opening the link in a new tab; `noopener noreferrer` is set. No store URL is currently configured. |
| 4 | Informational | Google Fonts are a third-party stylesheet and font dependency. SRI is not reliably applicable to the dynamically served Google Fonts CSS response. | Kept the existing visual font design. CSP permits only `fonts.googleapis.com` for styles and `fonts.gstatic.com` for fonts. Self-host the fonts if eliminating this third party is a future requirement. |
| 5 | Informational | The form is frontend-only. Client-side checks can be bypassed and do not deliver or securely retain a message. | The UI explicitly says the demo does not send or store information. If a backend is added, validate and constrain all fields server-side, apply abuse controls, and use an established secure delivery path. |
| 6 | Informational | Canonical, sitemap, and structured-data URLs still use `lingolift.example`. | Replace the reserved placeholder with the verified production domain before launch. The actual domain was not provided, so it was not guessed. |
| 7 | Medium | The previous Vercel and Netlify HSTS examples set `includeSubDomains` without evidence that every subdomain supports HTTPS. | Removed `includeSubDomains` from both configurations. The remaining one-year HSTS policy still must only be served on an HTTPS-ready production hostname. |
| 8 | Low | No automated repository security workflow or local HTML/link checker existed. The initial workflow used an older Node 20 Gitleaks action that could require an organization license. | Added `.github/workflows/security.yml` with JavaScript syntax checks, standard-library HTML/local-link/resource checks, conditional npm auditing, and the official Gitleaks CLI over full Git history. The scanner archive is pinned by version and SHA-256 checksum, avoiding a third-party action and organization license requirement. |
| 9 | Informational | There was no repository-owned not-found page. Host-generated 404 behavior varies. | Added `404.html` with `noindex, follow`. Verify the chosen host serves this page with an actual HTTP 404 response after deployment. |
| 10 | Informational | Native GitHub Secret Scanning and Push Protection are repository/account settings and cannot be verified from these local files. | Enable/check them in GitHub repository security settings when available. The added Gitleaks workflow is an additional repository check, not proof those GitHub features are enabled. |
| 11 | Informational | The static site has no build system and cannot load `.env.local` values in browser JavaScript. | Kept `.env.example` as a placeholder reference and configured `js/supabase-client.js` with the project URL and publishable key supplied by the owner. The client imports the version-pinned official Supabase JS package from jsDelivr; CSP permits that CDN and only this project origin for connections. |
| 12 | Informational | Sign-up and login screens are not connected to authentication. | Added noindex page previews with disabled fields and controls. They do not accept, store, or send credentials; authentication must be implemented separately after project configuration. |

## Code review

- JavaScript uses `textContent` for dynamic messages and the year. No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, `new Function`, URL-parameter execution, inline event handlers, or debug logging was found.
- No secret keys, passwords, private tokens, source maps, or backend credentials were found. The supplied Supabase publishable key is present in the browser client as intended; it is not a secret and must be protected by Supabase Auth configuration and Row Level Security.
- Internal navigation uses relative URLs. Google Fonts load over HTTPS. The Supabase client configuration imports the official Supabase JS package from a version-pinned jsDelivr ESM URL; no other remote JavaScript, icon library, iframe, or embedded content was found.
- The Google Play link opens a new tab only after URL validation and uses `rel="noopener noreferrer"`.
- Contact errors are fixed application-authored text written with `textContent`; user values are not reflected into the page. Name and email autocomplete remain enabled.
- The supplied logo is a local PNG; other visual artwork is local. No user-controlled redirect or browser permission request is present.
- Current files and locally available Git history were scanned for high-confidence secret patterns without printing matched content. No matches were found. This is not a substitute for provider-side scanning or rotating a credential if one is later discovered.
- There is no `package.json` or npm lockfile. The project does not declare or require npm runtime dependencies; the untracked `node_modules` directory contains no files. The CI npm audit is conditional on a future `package.json`.
- `.env.local` is ignored by the existing `.gitignore`; `.env.example` is an intentionally tracked placeholder template and is not loaded by the current static site. The browser client reads its configuration from constants in `js/supabase-client.js`.
- The Supabase browser client requires an HTTPS Supabase project URL and an `sb_publishable_` key, and rejects other key formats. The shared `supabase` client is initialized once per page module and is reused by imports; the test makes a read-only request to `/auth/v1/settings` only after the user runs it.
- Login and sign-up pages are `noindex, nofollow` previews, with disabled fields and buttons. They do not submit forms or transmit credentials.
- No source maps, environment files, private-key files, or credential-named tracked files were found. `.gitignore` excludes environment overrides, dependency/build output, deployment state, and source maps while permitting `.env.example`.
- Configured third-party requests include Google Fonts and the pinned Supabase JS ESM CDN. Supabase API requests are restricted by CSP to the supplied project origin. The test page is `noindex` and disables its check outside localhost. There are no third-party embedded frames.
- Repository ignore rules do not prevent someone from manually uploading files to a host. Inspect the final published output, and do not deploy local cache or credentials.

## Content Security Policy

The hosting configurations use:

```text
default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self'; connect-src 'self' https://zpujapkfegodxxdicwxa.supabase.co; frame-src 'none'; frame-ancestors 'none'; form-action 'self'; manifest-src 'self'; worker-src 'self'; upgrade-insecure-requests
```

The policy disallows inline/eval scripts, plugin content, frames, and unapproved origins while retaining the existing local scripts/styles/images, Google Fonts, the version-pinned Supabase JS CDN, and the supplied Supabase project API origin. If you change projects, update the `connect-src` project origin in both hosting configurations. JSON-LD blocks use the `application/ld+json` data type and are not executable JavaScript. No CSP meta element was added: the production HTTP response header is preferred.

The repository includes both `vercel.json` and Netlify `_headers` as **alternative host examples** because the production host is unknown. Use and verify the configuration for the actual host. Before enforcing CSP on a deployment, test the same policy in `Content-Security-Policy-Report-Only` response headers on a staging deployment, inspect browser violations and required pages/features, then enforce it. The policy has not been claimed active or verified on a deployed site.

## GitHub and automated checks

- The local high-confidence pattern scan inspected available Git commit additions and working project files with secret values suppressed. It found no matches. Repository history available in a local clone may differ from every remote ref; GitHub-side Secret Scanning is the appropriate independent history scan.
- The new GitHub Actions workflow runs for pushes and pull requests. It uses read-only repository permissions, pins GitHub-maintained actions to verified commit SHAs, checks all local HTML/link/resource references and JavaScript syntax, conditionally runs `npm audit` only if a dependency manifest appears, and runs the official Gitleaks CLI against full history. The scanner binary is pinned to version 8.30.1 and its verified SHA-256 checksum; no secret values are included in scan output.
- Gitleaks in CI has not yet run on GitHub in this change. Review its first workflow result. If it reports a credential, do not copy it into chat/logs: revoke/rotate it first, then remove it from tracked files and address repository history exposure.
- In GitHub **Settings → Code security and analysis**, enable Secret Scanning and Push Protection when available for this repository/account. These settings cannot be switched or verified from the checked-out project.
- npm auditing is not applicable now because no package manifest or lockfile exists. Do not add npm solely to host this static website.
- `scripts/check_site.py` is a dependency-free structural/local-link and external JavaScript module-host checker, not a standards-complete HTML5 validator. CI reports allowed external resource hosts and rejects unapproved hosts and unsafe blank-target links.

## Not-found handling, links, and deployment

- Added `404.html`; it is excluded from `sitemap.xml`, marked `noindex, follow`, and retains normal navigation back into the site.
- Local HTML navigation and resource targets are checked in CI. External-resource host allowlisting covers the current Google Fonts setup and existing Lingolift canonical placeholder URLs.
- The site has no `robots.txt` disallow rules; its sitemap remains discoverable. Structured-data blocks are local JSON-LD data scripts, not external executable scripts.
- Verify on the selected provider that an unknown URL returns status 404 with the custom page rather than returning a 200 soft-404. If necessary, configure the provider's not-found route.
- Review deployed output for unexpected generated files, caches, `.env` files, dependencies, or source maps before publishing. The repository currently tracks none of those.

## Security headers configured for hosting

- `Content-Security-Policy`: restrictive source allowlist, no inline/eval scripts, no objects or frames.
- `Strict-Transport-Security`: one-year HSTS for the serving hostname only; `includeSubDomains` is intentionally omitted because subdomain HTTPS readiness is unknown. Serve this header only after the hostname is HTTPS-ready. Do not opt into preload without a separate domain-wide readiness review.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `X-Frame-Options: DENY`, alongside CSP `frame-ancestors 'none'`.
- `Permissions-Policy` disables unused camera, microphone, geolocation, payment, and USB capabilities.

## Verification

- Passed `node --check` for all JavaScript files.
- Parsed all 15 HTML pages and `vercel.json`; checked page structure, titles, descriptions, H1s, duplicate IDs, local image/icon/script/style paths, alt attributes, form methods, inline event handlers, iframe use, internal fragments, and external JS module hosts with `python scripts/check_site.py`.
- Checked all local navigation/article links and referenced local resources; no broken local targets were found.
- Scanned local commit additions and project files for high-confidence secret patterns with matched values suppressed; no matches. Also ran the pinned Gitleaks CLI v8.30.1 against all six locally available commits and the working tree; no leaks were found. The hosted CI run remains pending.
- Checked Git tracking and repository files: no package manifest or lockfile, no tracked source maps or credential-named files, and no files in the local `node_modules` folder. `npm audit` was therefore not run locally; CI skips it unless a `package.json` is added.
- Browser-tested all 15 local pages, including `404.html`, `login.html`, `signup.html`, and `test-supabase.html`, at 320, 375, 768, 1024, and 1440 pixels; all loaded with no horizontal overflow or JavaScript page errors.
- Sign-up/login previews remain unconnected. The Supabase connection test uses only `/auth/v1/settings`, is guarded to localhost, and does not sign in, create users, or change database contents. A local browser test successfully reached the configured Supabase project; this does not verify deployed CSP headers or production hosting.
- Browser-tested the mobile menu and the contact form's empty, valid, over-length, and HTML-payload cases. The submitted test payload was not reflected as markup, and the form made no POST request.
- Tested the proposed CSP as a local `Content-Security-Policy-Report-Only` response header across the 11 content and article pages that existed before `404.html` was added, and separately on the Supabase connection test: zero CSP violations. The test page successfully reached the configured Auth settings endpoint. Report-only testing does not prove that the production host will send the policy or that enforcement is active.
- Confirmed the Vercel JSON is valid and the Vercel/Netlify security-header sets match. Both HSTS values omit `includeSubDomains`.
- After deployment, inspect real response headers on the homepage, an article, the contact page, and static assets; confirm HTTPS/HSTS behavior and verify browser console/network errors. A local static-server test cannot establish production header behavior.

## Deployment checklist

- [ ] Replace every `lingolift.example` canonical, Open Graph, JSON-LD, `robots.txt`, and sitemap URL with the production domain.
- [ ] Confirm the supplied Supabase URL and publishable key in `js/supabase-client.js` match the intended project; update `connect-src` in both host configurations if the project URL changes.
- [ ] Keep `.env.local` untracked. Do not put secret/service-role keys in browser code or any publicly deployed file.
- [ ] Verify `verifySupabaseConnection()` returns successfully in the deployed browser; review Supabase Auth URL/CORS settings if the request fails.
- [ ] Choose the correct provider configuration; do not assume both hosting examples are active.
- [ ] Verify CSP in report-only mode on staging; then enable and verify enforced CSP.
- [ ] Check CSP allows only required resources and blocks inline/eval scripts and framing.
- [ ] Verify HTTPS redirects and HSTS on the production hostname; `includeSubDomains` is intentionally not set.
- [ ] Verify `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, and `Permissions-Policy` in deployed responses.
- [ ] Enable and verify GitHub Secret Scanning and Push Protection in repository settings, if available.
- [ ] Confirm the checksum-pinned Gitleaks CLI workflow succeeds on the repository's full history and future pull requests.
- [ ] Confirm the dependency-audit CI step remains skipped until an npm manifest is intentionally introduced; if dependencies are added, commit a lockfile and review `npm audit` findings.
- [ ] Verify an unknown URL returns `404.html` with HTTP status 404, `noindex, follow`, and working navigation.
- [ ] Inspect the published artifact for development files, caches, environment files, credentials, source maps, and unexpected third-party requests.
- [ ] Verify Google Fonts and all local resources continue to load under the enforced CSP.
- [ ] Verify page, article, image, stylesheet, script, robots, and sitemap responses have expected status and content types.
- [ ] Check the contact form clearly remains non-submitting until a real backend is intentionally implemented.
- [ ] If adding form processing, validate on the server, impose request/body limits, protect against spam/abuse, and document retention/privacy.
- [ ] Configure the Play Store URL only after the official listing is published; keep the HTTPS Google Play URL validation.
- [ ] Re-run link, mobile, browser-console, and CSP checks against the production site.

## Limitations

This review covers the files present in this static project and does not certify the hosting account, DNS, TLS configuration, CDN, deployment pipeline, Supabase project policies, third-party font service, or future changes. Publishable keys are intended for browser use, but access is governed by Supabase Auth configuration, Row Level Security, and API policies. Client-side validation is not a security boundary. Security headers are only effective when the selected host serves them in HTTP responses.
