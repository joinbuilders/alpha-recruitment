# TODO

## Current state (as of 2026-08-23)

- Recruitment site is built: flash text → film → application (name, email) → claimed/redeem screens (`app/page.tsx`).
- Form submissions are wired to Supabase: `POST /api/apply` validates and inserts into `public.applications` in the **alpha_recruitment** project (ref `rmpeicswaxucmvpflbyd`).
  - RLS: insert-only for `anon`; reads only via dashboard. Security advisors are clean.
  - Local env lives in `.env.local` (gitignored): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`. See `.env.example`.
  - Verified end-to-end locally (test row inserted and cleaned up).
- **Uncommitted changes** awaiting Brayden's review: `app/api/apply/route.ts`, `.env.example`, `package.json`, `package-lock.json` (added `@supabase/supabase-js@2.112.3`).

## Next up

- [ ] Review + commit the Supabase wiring changes above (Brayden)
- [ ] Confirmation email (Resend) — added 2026-08-23, needs setup before it sends anything:
  - [ ] Create a Resend account/API key, verify the sending domain (Resend dashboard → Domains)
  - [ ] Set `RESEND_API_KEY` + `RESEND_FROM` in `.env.local` and in Vercel env vars (see `.env.example`)
  - [ ] **Verify the social URLs in `app/api/apply/confirmation-email.ts`** — Instagram/website/LinkedIn are guessed from the `joinbuilders` GitHub org name
  - [ ] Test: submit the form and check the email lands (sandbox `onboarding@resend.dev` only delivers to the Resend account's own inbox)
- [ ] Connect the repo to Vercel (Brayden)
- [ ] Add env vars in Vercel → Project → Settings → Environment Variables:
  - `SUPABASE_URL=https://rmpeicswaxucmvpflbyd.supabase.co`
  - `SUPABASE_PUBLISHABLE_KEY` (publishable key, `sb_publishable_...` — from Supabase dashboard → Settings → API Keys, or copy from local `.env.local`)
  - `SUBMIT_WEBHOOK_URL` (optional — Google Sheets webhook fallback; skip if unused)
- [ ] After first deploy: submit a test application on the deployed URL and confirm the row lands in `public.applications` (delete the test row after)
- [ ] Verify `film.mp4` (~public/) plays on the deployed site / stays under Vercel asset limits

## Ideas / open decisions (not started)

- [ ] Server-side redemption tracking: staff "hold to redeem" is localStorage-only today — nothing is recorded in Supabase when an item is handed out
- [ ] Duplicate-claim protection across devices (e.g. unique index on lower(email)) — currently double-claim is only blocked per device
