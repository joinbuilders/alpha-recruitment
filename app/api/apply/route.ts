import { after } from "next/server";

import { parseApplication } from "../application";
import { getSupabase } from "../supabase";
import { sendConfirmationEmail } from "./confirmation-email";

export async function POST(request: Request) {
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const application = parseApplication(data);
  if (!application) {
    return Response.json({ ok: false }, { status: 400 });
  }

  let stored = false;
  const db = getSupabase();
  if (db) {
    const { error } = await db.from("interest").insert(application);
    if (error) {
      // Unique violation on lower(email): this email already claimed on
      // another device. Skip the confirmation email too — not a new applicant.
      if (error.code === "23505") {
        return Response.json({ ok: false, duplicate: true }, { status: 409 });
      }
      console.error("supabase insert failed:", error);
    } else {
      stored = true;
      // Runs after the response is sent, so the applicant never waits on Resend.
      after(() =>
        sendConfirmationEmail(application.name, application.email)
      );
    }
  } else {
    console.error(
      "SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY not set; application not stored:",
      application
    );
  }

  return Response.json({ ok: stored }, { status: stored ? 200 : 500 });
}
