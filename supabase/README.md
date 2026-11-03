# Contact form notifications

The browser submits the contact form to the same-origin `/api/contact` route on the existing `lingolift-website` Cloudflare Worker. The Worker limits the request body to 10 KB, signs the timestamp, client IP, and exact raw request body with HMAC-SHA256, and forwards it to the `contact-notification` Supabase Edge Function. The function verifies that signature before parsing the body, validates and sanitizes the input, applies a limit of five requests per client IP in each 15-minute window, and sends one notification through Resend. It does not send a confirmation email to the visitor.

The signature format is UTF-8 bytes of `timestamp + "\n" + clientIp + "\n"` followed by the exact raw body bytes. The timestamp is Unix seconds and the function accepts signatures no more than five minutes old or in the future. This authenticates the Worker-to-function request; it does not prevent replay of a captured request within that five-minute window.

## Configure and deploy

1. In Resend, verify a sending domain and create an API key. Use a sender address on that verified domain.

2. Generate a strong random HMAC secret with at least 32 characters. Configure the **same value** in both secret stores without putting it in repository files or browser code:

   - Cloudflare Worker secret: `CONTACT_WORKER_HMAC_SECRET`
   - Supabase Edge Function secret: `CONTACT_WORKER_HMAC_SECRET`

   Add the Cloudflare value through the Cloudflare dashboard or run `npx wrangler secret put CONTACT_WORKER_HMAC_SECRET` from the repository root and enter it at the prompt. Add the Supabase value under **Project Settings → Edge Functions → Secrets**. Do not paste the secret into chat, commit it, or put it in `wrangler.jsonc` or a `.dev.vars` file that might be committed.

3. In the Supabase project `zpujapkfegodxxdicwxa`, configure these Edge Function secrets under **Project Settings → Edge Functions → Secrets**:

   | Secret | Purpose |
   | --- | --- |
   | `CONTACT_WORKER_HMAC_SECRET` | Shared server-to-server HMAC secret |
   | `RESEND_API_KEY` | Resend API credential |
   | `RESEND_FROM_EMAIL` | Sender on the verified Resend domain |
   | `CONTACT_ADMIN_EMAIL` | Administrator inbox for notifications |
   | `CONTACT_ALLOWED_ORIGIN` | Exact HTTPS origin serving the site, without a trailing slash |
   | `CONTACT_RATE_LIMIT_SALT` | Random private salt of at least 32 characters for IP hashing |

   The currently provided Worker URL is `https://lingolift-website.randeepaganganath68.workers.dev`; use its origin as `CONTACT_ALLOWED_ORIGIN` unless a custom domain is configured for the site. Verify the actual production hostname before setting this value.

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are read only by the server-side function environment. The service-role key must never be placed in Cloudflare variables, frontend files, public assets, or responses.

4. The Worker reads `SUPABASE_PUBLISHABLE_KEY` from the existing public browser configuration in `js/supabase-client.js`; its value in `wrangler.jsonc` is a publishable key, not a secret. Do not replace it with a service-role key. Wrangler's static assets use the repository root, and `.assetsignore` excludes the `supabase/` source and Wrangler configuration from public assets.

5. From the repository root, deploy the database migration and Edge Function only when you are ready:

   ```powershell
   supabase login
   supabase link --project-ref zpujapkfegodxxdicwxa
   supabase db push
   supabase functions deploy contact-notification
   ```

   `supabase db push` creates the rate-limit table and restricted RPC. The function's `verify_jwt = false` setting is required for unauthenticated visitors; the HMAC check authenticates requests forwarded by the Worker. CORS and the exact `Origin` check are browser controls, not authentication.

6. Deploy the existing Worker through the established GitHub → Cloudflare workflow, or manually with the existing command `npx wrangler deploy` if that is how the owner operates the project. This updates the existing `lingolift-website` Worker; it does not create another Worker.

7. Submit a test message from the production site and confirm it arrives in the configured administrator inbox. A successful response means Resend accepted the notification; final mailbox delivery still depends on the Resend account and recipient mail provider.

## Security notes

- The HMAC secret, Resend API key, and Supabase service-role key belong only in their respective server-side secret stores. The browser sends no such credentials.
- The Worker constructs fresh upstream headers, so caller-supplied `X-Contact-*`, authorization, and forwarding headers are not passed through as authentication.
- Cloudflare documents `CF-Connecting-IP` as the client IP header Cloudflare sends to an origin, and documents special behavior for Worker subrequests. The documentation reviewed here does not explicitly guarantee that this header is overwritten and trustworthy on requests entering this particular `workers.dev` Worker. Verify the deployed ingress behavior before relying on IP-based limiting as a security boundary. The Worker rejects requests where the header is absent or not IP-shaped, but that alone does not prove that the value cannot be spoofed.
- The timestamp prevents old signed requests from being accepted, but there is no nonce/replay store; a captured signed request could be replayed during its five-minute validity window. The existing per-IP rate limit remains enabled and atomically allows at most five requests per IP hash per fixed 15-minute window.
- A Resend API acceptance response confirms that the provider accepted the message, not that it reached the inbox.
