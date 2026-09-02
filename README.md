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

## Offline

Venue Wi-Fi is assumed to be unreliable, so nothing depends on the network being up at the moment it's used.

- **The page itself** is cached by a service worker (`public/sw.js`), so after one successful visit a reload works with no connection. Navigations still prefer the network and fall back to the cached shell after 3.5s. `/api/*` is never cached, and `film.mp4` is left to the browser (25 MB, range requests). Registration is production-only — `next dev` unregisters any worker left on the origin. **Bump `VERSION` in `sw.js` when the precached asset list changes.**
- **The claim and the hand-out** go through a durable outbox (`lib/outbox.ts`), not a bare `fetch`. Both are written to localStorage before they're sent and only leave the queue once the server accepts them (or rejects them in a way retrying can't fix — 409 duplicate, 422 undeliverable domain, 400 bad payload), so answers survive a dead network, a closed tab, and a device that doesn't come back into signal until later. Retries fire on reconnect, on tab focus, every 15s, and via `sendBeacon` on page hide.
- A **`SAVED · WILL SYNC`** chip appears in the corner whenever something is still queued — that's how staff can tell a claim hasn't reached Supabase yet. It disappears on its own once the queue drains.
- If a claim never reaches the server at all, the hand-out still recovers the lead: `redeem_application` inserts a pre-redeemed row (`recorded_without_claim`).

Note that the undeliverable-email check in `/api/apply` is an online-only guarantee: an offline claim is queued without reaching the server, so a typo'd address still claims and is dropped from the queue when the 422 finally comes back.

Known gap: a device that claims offline and never reopens the page keeps its answers in localStorage until it does. Background Sync would cover that, but iOS doesn't support it, and most devices here are iPhones.

## Assets

- `public/film.mp4` — the film (plays after the flash text; skippable by tapping)
- `public/rooftop.jpg` — the film's final frame, backdrop of the application intro
- `public/night-sky.png` — site background under the starfield canvas
- `public/builders-logo.svg` — logo (white via `currentColor`)
