# TODO

## Current state (as of 2026-08-23, evening)

- Recruitment site is built: flash text → film → application (name, email) → claimed/redeem screens (`app/page.tsx`).
- Form submissions are wired to Supabase: `POST /api/apply` validates and inserts into `public.applications` in the **alpha_recruitment** project (ref `rmpeicswaxucmvpflbyd`).
  - RLS: insert-only for `anon`; reads only via dashboard. Security advisors are clean.
- Vercel is set up: project **alpha-recruitment** (team Builders) linked to `joinbuilders/alpha-recruitment`, framework preset fixed to Next.js (was unset → routes 404'd), env vars (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUBMIT_WEBHOOK_URL`) set for Production + Preview.
  - Preview verified end-to-end: homepage 200, `POST /api/apply` → row in `public.applications` (test row deleted), `film.mp4` streams with range support.
  - Deployment protection: Vercel Auth on all `*.vercel.app` URLs; custom domains public.
  - **Live in production** since 2026-08-23: https://www.joinbuilders.org (apex 308-redirects to www), deployed from `main` @ `9a6e1b9`. Smoke-tested: homepage 200, `film.mp4` streams (206 range), `/api/apply` function responding. Pushes to `main` auto-deploy to production from here on.

## Next up

- [ ] Confirmation email (Resend) — wired up 2026-08-23:
  - [x] Resend domain `joinbuilders.org` verified; sending API key `alpha-recruitment-vercel` created (sending-only, restricted to that domain)
  - [x] `RESEND_API_KEY`, `RESEND_FROM` (`BUILDERS <hello@joinbuilders.org>`), `RESEND_WEBHOOK_SECRET` set in Vercel (Production + Preview). Not in `.env.local` — set locally if you want emails from `next dev`
  - [x] Email errors are recorded in Supabase (`public.email_errors`, insert-only RLS like `applications`, advisors clean): send-API failures logged from the app; delivery failures (bounce/complaint/delay/failed/suppressed) POSTed by a Resend webhook to `/api/webhooks/resend` (webhook created in Resend, id `a58d2348…`). Webhook 404s until this branch deploys — Resend retries, and nothing sends emails before then anyway
  - [ ] **Verify the social URLs in `app/api/apply/confirmation-email.ts`** — Instagram/website/LinkedIn are guessed from the `joinbuilders` GitHub org name
  - [ ] Test: submit the form and check the email lands, then check `public.email_errors` stays empty (try a bounce with `bounced@resend.dev` if curious)

- [ ] Redemption tracking + cross-device dedupe — done 2026-08-23, ship the code:
  - [x] Migration applied to alpha_recruitment (`supabase/migrations/20260823210000_redemption_tracking.sql`, kept in-repo as the schema record): `applications.redeemed_at`, unique index on `lower(email)`, and the `redeem_application` security-definer RPC (anon stays insert-only on the table; RPC execute is anon-only). All three RPC paths + the 23505 duplicate rejection tested against prod, test rows deleted
  - [x] One pre-existing duplicate removed before indexing: abu-romeh.3@osu.edu had two identical rows 36s apart; kept the earlier (id 67), deleted id 68
  - [x] `/api/apply` returns 409 on duplicate email; form waits for the server, shows "That email already claimed — see a Builders team member", but still claims optimistically if the server is unreachable (offline/timeout → don't strand applicants on venue Wi-Fi)
  - [x] Staff hold-to-redeem fires `/api/redeem` (fire-and-forget) → RPC stamps `redeemed_at`, or inserts a pre-redeemed row if the claim never reached the server
  - Security advisors: 1 intentional WARN (anon can execute the security-definer RPC — that's the design; the alternative was granting anon UPDATE on the table). Was previously fully clean
  - [ ] Ship it: deploy this branch — schema is live and backward-compatible with the code currently in production
