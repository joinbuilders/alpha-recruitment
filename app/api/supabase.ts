import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazy so a missing env var degrades to a logged error instead of crashing the module.
let supabase: SupabaseClient | null | undefined;
export function getSupabase() {
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

export interface EmailErrorEntry {
  recipient: string;
  /** "send_failed" for API-call failures, or a Resend webhook type like "email.bounced". */
  event: string;
  message?: string;
  email_id?: string;
  payload?: unknown;
}

// Records the failure in public.email_errors so it's visible in Supabase,
// not just the Vercel function logs. Never throws — logging must not take
// down the caller.
export async function logEmailError(entry: EmailErrorEntry) {
  const db = getSupabase();
  if (!db) {
    console.error("supabase not configured; email error not recorded:", entry);
    return;
  }
  // Stay inside the table's CHECK limits so the insert itself can't fail.
  const { error } = await db.from("email_errors").insert({
    ...entry,
    recipient: entry.recipient.slice(0, 320),
    event: entry.event.slice(0, 50),
    message: entry.message?.slice(0, 2000),
    email_id: entry.email_id?.slice(0, 100),
  });
  if (error) {
    console.error("email_errors insert failed:", error, "entry:", entry);
  }
}
