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

- (nothing blocking — site is live)

## Ideas / open decisions (not started)

- [ ] Server-side redemption tracking: staff "hold to redeem" is localStorage-only today — nothing is recorded in Supabase when an item is handed out
- [ ] Duplicate-claim protection across devices (e.g. unique index on lower(email)) — currently double-claim is only blocked per device
