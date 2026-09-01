# alpha-recruitment

BUILDERS Fall '26 recruitment site: flash text → film → two-question application → green claim screen → staff hold-to-redeem.

## Run

```
npm run dev
```

Visit `/?reset=1` to wipe a device's state (seen-film flag, in-progress answers, claimed, redeemed) while testing.

## Where submissions go

The form POSTs `{name, email, time}` to `/api/apply`, which inserts into `public.interest` in the **builders** Supabase project (see `.env.example` — copy to `.env.local`; the publishable key is insert-only, reads happen in the dashboard). One claim per email across all events: duplicates get a 409 and the "already claimed" message. Staff hold-to-redeem POSTs to `/api/redeem`, which stamps `redeemed_at` via the `redeem_application` RPC (see `supabase/migrations/`).

After a successful submission the applicant also gets a "you're on the list" confirmation email via Resend (`app/api/apply/confirmation-email.ts`). Requires `RESEND_API_KEY` and `RESEND_FROM` (see `.env.example`); without them the email is skipped and the submission still succeeds.

## Assets

- `public/film.mp4` — the film (plays after the flash text; skippable by tapping)
- `public/rooftop.jpg` — the film's final frame, backdrop of the application intro
- `public/night-sky.png` — site background under the starfield canvas
- `public/builders-logo.svg` — logo (white via `currentColor`)
