import { parseApplication } from "../application";
import { getSupabase } from "../supabase";

// Records a staff hold-to-redeem in Supabase. The client fires this without
// waiting (staff shouldn't stand around on venue Wi-Fi), so failures here only
// lose the audit record, never block the hand-out.
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

  const db = getSupabase();
  if (!db) {
    console.error(
      "SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY not set; redemption not recorded:",
      application
    );
    return Response.json({ ok: false }, { status: 500 });
  }

  // Stamps redeemed_at on the matching application, or inserts a pre-redeemed
  // row when the claim never reached the server. See the migration for details.
  const { data: outcome, error } = await db.rpc("redeem_application", {
    p_email: application.email,
    p_name: application.name,
  });
  if (error) {
    console.error("redeem_application failed:", error);
    return Response.json({ ok: false }, { status: 500 });
  }

  return Response.json({ ok: true, outcome });
}
