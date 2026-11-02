# Lingolift Website Project Report

## 1. Project overview

Lingolift is an official brand and information website for an English-learning Android app aimed at Sri Lankan students and English beginners. It is a static, frontend-only website built with HTML5, CSS3, and vanilla JavaScript.

The website introduces the brand and app, publishes English-learning articles, provides contact-form feedback in the browser, and encourages visitors to find the Android app. It is not a lesson platform or student dashboard.

There is no frontend framework, application build system, server-side application, or declared npm dependency manifest. Supabase Auth is integrated in the browser for registration, login, logout, email verification, and password recovery. No database tables, learning data, or Android synchronization are implemented.

## 2. Work completed

### Website and brand

- Created a responsive multi-page website with a shared brand identity, navigation, footer, and mobile menu.
- Added the Lingolift logo supplied for the project and replaced the former leaf mark in the website branding.
- Created the homepage, About, Features, Blog, Contact, and Download pages.
- Added five educational articles, a custom 404 page, and search-engine resources.
- Added Sign up and Log in navigation across the site's shared navigation, with a session-aware logout action.

### Security improvements

- Added restrictive Content Security Policy (CSP) and related response-header examples for Vercel and Netlify.
- Added bounded client-side contact-form validation and safe text rendering. The form does not send or store messages.
- Added validation for the future Google Play URL.
- Added a GitHub Actions workflow for JavaScript syntax, local HTML/link checks, optional dependency auditing, and secret scanning.
- Added a custom not-found page and a standard-library site checker.
- Reviewed the available local history and working files for secrets; the local Gitleaks scan reported no leaks.

### Supabase setup

- Added a reusable Supabase client using the official, version-pinned `@supabase/supabase-js` ESM package.
- Configured the client with the project URL and publishable key supplied by the project owner. No service-role key, secret key, or database password is used.
- Added a localhost-only connection test page. The test makes a read-only request to Supabase Auth settings and does not create users, sign in, or change database contents.
- Updated the Vercel and Netlify CSP examples to allow the pinned package CDN and the exact configured Supabase project origin.
- Kept `.env.example` as a placeholder reference. This static site has no build tool, so browser JavaScript cannot read `.env.local`; the existing `.gitignore` already excludes local `.env.*` files.
- Implemented Supabase Auth sign-up, password login, logout, email-confirmation redirects, password-reset email requests, and password updates using the existing publishable client.
- Enabled persistent sessions, automatic token refresh, and URL callback detection through the official Supabase client. The client-only static site uses Supabase's browser implicit flow.
- Added client-side form validation, password visibility controls, accessible request states, and non-enumerating recovery feedback. Passwords are sent only to Supabase Auth and are not saved by the website.
- Hardened callback handling for query-string and URL-fragment errors, and only enable password reset after a recovery callback and session are detected.
- Kept sign-in and duplicate-registration failures generic; known invalid-credential responses are mapped to safe guidance rather than displaying Supabase error text.
- Logout calls `signOut()`, immediately updates the navigation after success, and redirects to the public homepage.
- Added `forgot-password.html` and `reset-password.html`; all account pages remain `noindex, nofollow`.
- Added a profile page that reads and updates the signed-in user's `public.profiles` row, stores private avatars in the existing `avatars` bucket, and displays them using short-lived signed URLs. The client scopes profile queries and object paths to the authenticated user ID and does not create tables or policies.
- The profile feature expects `public.profiles` to have `id`, `full_name`, `avatar_path`, and `updated_at` columns, an existing row for each account, and RLS policies that allow authenticated users to select/update only their own row. The private `avatars` bucket must already exist with object policies that permit each authenticated user to access only objects under their own user-ID folder.

## 3. How the main code works

### Static pages and styling

Each `.html` file is a page the browser loads directly. The shared `css/style.css` contains the brand styles and reusable components. `css/responsive.css` adapts the main website to smaller screens. Authentication and connection-test pages use separate stylesheets so their layouts can be maintained without changing the existing site design.

### Shared JavaScript

- `js/main.js` handles the mobile navigation, shared account-navigation entry point, displayed year, reveal animations, and Google Play URL validation.
- `js/contact.js` checks contact-form fields, displays fixed error messages via `textContent`, and focuses the first invalid field. A valid submission only displays a notice; no network request or storage occurs.
- `js/auth.js` dynamically loads the shared client, handles registration/login/recovery/password updates, displays fixed application-authored messages, and removes callback tokens or errors from the URL after processing. Reset forms require a recovery callback and active session; verification messaging checks the active user's `email_confirmed_at` when available.
- `js/auth-navigation.js` shows login/sign-up or the signed-in user's profile menu based on the Supabase session, and reads only that user's profile row for the full name and signed avatar URL.
- `js/auth-navigation.js` also clears the session through Supabase and redirects to the public homepage after successful sign out.
- `js/profile.js` validates profile edits and avatar files, scopes profile updates and storage paths to the authenticated user, and uses short-lived signed URLs for private avatar previews.
- `profile.html` and `css/profile.css` provide the responsive profile and account-settings interface.

### Supabase client

`js/supabase-client.js` imports `createClient` from the official Supabase JavaScript package and creates the exported `supabase` client when that module is imported. JavaScript modules are cached by the browser, so subsequent imports on the same page reuse the module instance. The URL is checked for HTTPS and a Supabase project host; the key must use the publishable-key format. Auth persists sessions and detects the browser-only email callback flow.

To use the client in a future page or script:

```js
import { supabase } from "./supabase-client.js";
```

The connection helper, `verifySupabaseConnection()`, sends a `GET` request to:

```text
<configured-project-origin>/auth/v1/settings
```

It supplies the publishable key in the `apikey` request header, aborts after ten seconds, and throws a generic error on failure. It does not expose the key in the page status message.

### Development-only connection test

`test-supabase.html` loads `js/supabase-connection-test.js`. The script first checks that the page is running on `localhost`, `127.0.0.1`, or the IPv6 loopback address. Only after the visitor selects **Test connection** does it dynamically import the Supabase client and run the health check. The result is displayed in an accessible status element. The test button is disabled outside localhost.

## 4. File guide

### Main pages

| File | Purpose |
|---|---|
| `index.html` | Brand homepage, app introduction, features, blog preview, FAQ, and calls to action |
| `about.html` | Story, mission, vision, and learning philosophy |
| `features.html` | Mobile-app feature presentation |
| `blog.html` | Educational article index |
| `contact.html` | Contact-form validation demo; does not submit data |
| `download.html` | Android app promotion and illustrative app previews |
| `articles/*.html` | Five individual SEO-oriented learning articles |
| `login.html`, `signup.html` | Noindex Supabase login and email-verification registration pages |
| `forgot-password.html`, `reset-password.html` | Noindex password recovery and password update pages |
| `404.html` | Branded not-found page |
| `test-supabase.html` | Local development-only Supabase connection check; noindex |

### Code and assets

| File or directory | Purpose |
|---|---|
| `css/style.css` | Shared brand styles and common components |
| `css/responsive.css` | Responsive rules for the main site |
| `css/auth.css` | Styles for account registration, login, and password recovery pages |
| `css/supabase-test.css` | Styles for the development connection test |
| `js/main.js` | Navigation, year, animation, and Play Store link behavior |
| `js/auth.js` | Supabase sign-up, login, email confirmation callback, and password recovery/update |
| `js/auth-navigation.js` | Shared signed-in/signed-out navigation state and logout action |
| `js/contact.js` | Contact form client-side validation |
| `js/supabase-client.js` | Shared Supabase client and connection-check helper |
| `js/supabase-connection-test.js` | Localhost guard and connection-test UI behavior |
| `images/` | Brand logo and social sharing artwork |

### SEO, hosting, and quality checks

| File | Purpose |
|---|---|
| `robots.txt`, `sitemap.xml` | Search crawling and URL discovery; production-domain placeholders must be replaced before launch |
| `vercel.json`, `_headers` | Alternative Vercel and Netlify security-header configurations; use the one matching the eventual host |
| `.gitignore` | Excludes `.env.*`, build output, dependencies, and other local-only files |
| `.env.example` | Placeholder documentation only; not read by this static website |
| `.github/workflows/security.yml` | Automated checks on pushes and pull requests |
| `scripts/check_site.py` | Checks HTML structure, local links/resources/fragments, external host allowlists, and external JS module hosts |
| `SECURITY_AUDIT.md` | Security findings, checks, limitations, and deployment checklist |
| `PROJECT_REPORT.md` | This project and implementation report |

## 5. Running and verifying locally

From the project directory, start Python's static server:

```powershell
python -m http.server 8000
```

Open the website at `http://localhost:8000/`. For the Supabase test, open:

```text
http://localhost:8000/test-supabase.html
```

Select **Test connection**. A success message means the browser received a successful response from the configured Supabase Auth settings endpoint. A generic failure message means to check the network, project configuration, and Supabase project availability.

The project has no `package.json`; do not run `npm install` just to serve the static website. Existing local checks can be run with:

```powershell
python scripts/check_site.py
node --check js/main.js
node --check js/auth.js
node --check js/auth-navigation.js
node --check js/contact.js
node --check js/supabase-client.js
node --check js/supabase-connection-test.js
```

The latest site-checker run passed on 18 HTML pages and 365 local navigation/resource references. JavaScript syntax checks for the auth modules and Supabase client, CSP parity checks, and `git diff --check` also passed. Browser tests with mocked Supabase responses exercised auth navigation states, profile reads/updates, `updated_at` writes, avatar preview/upload/removal, user-scoped storage paths, and short-lived signed URLs. These mocked tests verify client requests and UI behavior, not real account changes, storage access, or email delivery.

The configured Supabase Auth settings endpoint returned HTTP 200 during verification. Its public settings reported email sign-in enabled, signups enabled, and email autoconfirm disabled. This confirms those project settings at the time checked, but does not confirm production email delivery, redirect allowlists, or successful real-user authentication.

## 6. Security and deployment notes

- A Supabase publishable key is intended for browser use; it is not a secret credential. Never put a Supabase secret/service-role key or database password in frontend code.
- `.env.example` documents variable names but does not configure the browser. The static client currently reads its settings from constants in `js/supabase-client.js`.
- The CSP configuration allows the exact Supabase project origin for connections and private signed avatar images, plus `blob:` for local image previews; jsDelivr is allowed for the version-pinned official Supabase package. The Vercel and Netlify CSP policies were checked for parity.
- The Vercel and Netlify files are alternatives, not proof either provider is active. Production response headers and 404 routing must be verified after deployment.
- The canonical URLs, Open Graph URLs, `robots.txt`, and sitemap still contain the placeholder domain `lingolift.example`; replace these with the verified production domain before launch.
- The connection test is intentionally restricted to localhost and is not included in the sitemap. Do not rely on that check alone to configure production hosting.
- Website authentication uses Supabase Auth and the browser publishable key. Real registration, email verification, and recovery still depend on the deployed Site URL, allowed callback URLs, and configured email provider/templates. Email autoconfirm was reported disabled by the public settings endpoint during the latest check.
- Auth flows have not been tested end-to-end with a real email account. Mocked browser responses and public Auth settings checks cannot verify inbox delivery, real confirmation links, or password changes on a real account.
- There is no learning progress sync, Android session sharing, or backend API. The profile interface depends on the existing Supabase profile schema and Row Level Security policies; it does not provision them.
- Client-side validation and navigation visibility are not authorization controls. Protect all future data access with Supabase policies and server-enforced checks.

## 7. Remaining work

1. Replace all placeholder canonical and sitemap domains with the actual production domain.
2. Select the production host and verify CSP and other headers in real HTTP responses.
3. Keep Supabase Auth redirect and site URL settings aligned with the eventual website domain and Android deep link.
4. Configure and test Supabase email confirmation and password recovery templates with the exact website redirect URLs.
5. Add and test Row Level Security policies before connecting user-specific data.
6. Confirm the GitHub Actions workflow succeeds on GitHub and enable Secret Scanning/Push Protection in repository settings where available.
