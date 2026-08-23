import { Resend } from "resend";

import { logEmailError } from "../../supabase";

// Resend calls this route (configured in the Resend dashboard → Webhooks) for
// delivery failures that happen after the send API call succeeds — bounces,
// spam complaints, suppressions, and the like. Each one is recorded in
// public.email_errors so it's visible in Supabase alongside send failures.

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("RESEND_WEBHOOK_SECRET not set; Resend webhook rejected");
    // 500 keeps Resend retrying until the env var is configured.
    return new Response("webhook secret not configured", { status: 500 });
  }

  // Signature covers the raw body, so read text before any JSON parsing.
  const payload = await request.text();
  let event: ReturnType<Resend["webhooks"]["verify"]>;
  try {
    // verify() is local signature crypto and never uses the API key, but the
    // Resend constructor insists on having one.
    const resend = new Resend(process.env.RESEND_API_KEY || "re_verify_only");
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret: secret,
    });
  } catch {
    return new Response("invalid signature", { status: 401 });
  }

  if (
    event.type === "email.bounced" ||
    event.type === "email.complained" ||
    event.type === "email.delivery_delayed" ||
    event.type === "email.failed" ||
    event.type === "email.suppressed"
  ) {
    let message: string | undefined;
    switch (event.type) {
      case "email.bounced":
        message = event.data.bounce.message;
        break;
      case "email.failed":
        message = event.data.failed.reason;
        break;
      case "email.suppressed":
        message = event.data.suppressed.message;
        break;
      case "email.complained":
        message = "Recipient marked the email as spam";
        break;
      case "email.delivery_delayed":
        message = "Delivery delayed (soft bounce); Resend is retrying";
        break;
    }
    await logEmailError({
      recipient: event.data.to.join(", "),
      event: event.type,
      message,
      email_id: event.data.email_id,
      payload: event.data,
    });
  }

  // Acknowledge everything verified, including event types we don't record.
  return new Response("ok");
}
