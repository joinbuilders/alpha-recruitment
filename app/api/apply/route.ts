import { after } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { sendConfirmationEmail } from "./confirmation-email";

// Lazy so a missing env var degrades to a logged error instead of crashing the module.
let supabase: SupabaseClient | null | undefined;
function getSupabase() {
  if (supabase !== undefined) return supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  supabase =
    url && key
      ? createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
  return supabase;
}

// Mirrors the client-side checks and the DB constraints on public.applications,
// so anything accepted here can't fail the table's CHECKs.
function parseApplication(data: unknown) {
  if (typeof data !== "object" || data === null) return null;
  const { name, email, time } = data as Record<string, unknown>;
  if (typeof name !== "string" || typeof email !== "string") return null;
  const cleanName = name.trim();
  const cleanEmail = email.trim();
  if (!cleanName || cleanName.length > 200) return null;
  if (!/.+@.+\..+/.test(cleanEmail) || cleanEmail.length > 320) return null;
  const claimedAt =
    typeof time === "string" && !Number.isNaN(Date.parse(time)) ? time : null;
  return { name: cleanName, email: cleanEmail, claimed_at: claimedAt };
}

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
    const { error } = await db.from("applications").insert(application);
    if (error) {
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

  const webhook = process.env.SUBMIT_WEBHOOK_URL;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      // Don't fail the applicant's request over a slow sheet — log and move on.
      console.error("submit webhook failed:", err);
    }
  }

  return Response.json({ ok: stored }, { status: stored ? 200 : 500 });
}
