# alpha-recruitment

BUILDERS Fall '26 recruitment site: flash text → film → two-question application → green claim screen → staff hold-to-redeem.

## Run

```
npm run dev
```

Visit `/?reset=1` to wipe a device's state (seen-film flag, in-progress answers, claimed, redeemed) while testing.

## Where submissions go

The form POSTs `{name, email, time}` to `/api/apply`, which forwards it to `SUBMIT_WEBHOOK_URL` (see `.env.example` — copy to `.env.local`). Point it at a Google Apps Script web app that appends rows to a Sheet:

```js
function doPost(e) {
  const row = JSON.parse(e.postData.contents);
  SpreadsheetApp.openById("SHEET_ID").getSheets()[0]
    .appendRow([row.name, row.email, row.time]);
  return ContentService.createTextOutput("ok");
}
```

Deploy in Apps Script as Web app → execute as **Me** → access **Anyone**, and put the `/exec` URL in `SUBMIT_WEBHOOK_URL`. Without it, submissions are only logged server-side.

## Assets

- `public/film.mp4` — the film (plays after the flash text; skippable by tapping)
- `public/rooftop.jpg` — the film's final frame, backdrop of the application intro
- `public/night-sky.png` — site background under the starfield canvas
- `public/builders-logo.svg` — logo (white via `currentColor`)
