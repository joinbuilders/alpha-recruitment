import { Resend } from "resend";

import { logEmailError } from "../supabase";

// TODO(brayden): verify these before launch — guessed from the joinbuilders GitHub org.
// Links with an empty string are left out of the email.
const LINKS = [
  { label: "Instagram", url: "https://instagram.com/joinbuilders" },
  { label: "Website", url: "https://joinbuilders.com" },
  { label: "LinkedIn", url: "https://linkedin.com/company/joinbuilders" },
].filter((link) => link.url);

// The resend.dev sandbox only delivers to the Resend account's own email;
// set RESEND_FROM to an address on a verified domain for real sends.
const FROM = process.env.RESEND_FROM || "BUILDERS <onboarding@resend.dev>";

const BRAND_RED = "#ff2b20";
const INK_DARK = "#040714";
const BODY_GRAY = "#474a54";
const FONT_STACK =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

// Lazy so a missing env var degrades to a logged error instead of crashing the module.
let resend: Resend | null | undefined;
function getResend() {
  if (resend !== undefined) return resend;
  const key = process.env.RESEND_API_KEY;
  resend = key ? new Resend(key) : null;
  return resend;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(firstName: string) {
  const linksRow = LINKS.map(
    (link) =>
      `<a href="${link.url}" style="color: ${BRAND_RED}; font-weight: 500; text-decoration: none;">${link.label}</a>`
  ).join(
    `<span style="color: #c8c9ce; padding: 0 10px;">&middot;</span>`
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff;">
  <div style="display: none; max-height: 0; overflow: hidden;">You&rsquo;re on our list &mdash; more information is on the way.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 56px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; text-align: left;">
          <tr>
            <td style="padding-bottom: 28px;">
              <div style="width: 40px; height: 4px; background-color: ${BRAND_RED};"></div>
            </td>
          </tr>
          <tr>
            <td style="font-family: ${FONT_STACK}; font-size: 14px; font-weight: 700; letter-spacing: 0.2em; color: ${INK_DARK}; padding-bottom: 32px;">
              BUILDERS
            </td>
          </tr>
          <tr>
            <td style="font-family: ${FONT_STACK}; font-size: 24px; font-weight: 700; color: ${INK_DARK}; padding-bottom: 16px;">
              You&rsquo;re on the list.
            </td>
          </tr>
          <tr>
            <td style="font-family: ${FONT_STACK}; font-size: 16px; line-height: 1.6; color: ${BODY_GRAY}; padding-bottom: 32px;">
              Hey ${escapeHtml(firstName)} &mdash; thanks for applying. We&rsquo;ve got your details, and we&rsquo;ll send more information soon. Keep an eye on your inbox.
            </td>
          </tr>
          <tr>
            <td style="border-top: 1px solid #ececee; padding-top: 24px; font-family: ${FONT_STACK}; font-size: 14px; padding-bottom: 24px;">
              ${linksRow}
            </td>
          </tr>
          <tr>
            <td style="font-family: ${FONT_STACK}; font-size: 12px; color: #9a9ca3;">
              &copy; ${new Date().getFullYear()} BUILDERS &mdash; you&rsquo;re receiving this because you applied.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildText(firstName: string) {
  const links = LINKS.map((link) => `${link.label}: ${link.url}`).join("\n");
  return `Hey ${firstName} — thanks for applying. You're on our list, and we'll send more information soon.

${links}

© ${new Date().getFullYear()} BUILDERS — you're receiving this because you applied.`;
}

export async function sendConfirmationEmail(name: string, email: string) {
  const client = getResend();
  if (!client) {
    console.error("RESEND_API_KEY not set; confirmation email not sent to:", email);
    await logEmailError({
      recipient: email,
      event: "send_failed",
      message: "RESEND_API_KEY not set; confirmation email not sent",
    });
    return;
  }

  const firstName = name.trim().split(/\s+/)[0];
  try {
    // The SDK reports API failures via `error`, not exceptions.
    const { error } = await client.emails.send(
      {
        from: FROM,
        to: [email],
        subject: "You're on the list — BUILDERS",
        html: buildHtml(firstName),
        text: buildText(firstName),
      },
      // Dedupes repeat submissions from the same address for 24h.
      { idempotencyKey: `application-confirmation/${email.toLowerCase().slice(0, 220)}` }
    );
    if (error) {
      console.error("confirmation email failed:", error.message);
      await logEmailError({
        recipient: email,
        event: "send_failed",
        message: error.message,
        payload: error,
      });
    }
  } catch (err) {
    console.error("confirmation email failed:", err);
    await logEmailError({
      recipient: email,
      event: "send_failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
