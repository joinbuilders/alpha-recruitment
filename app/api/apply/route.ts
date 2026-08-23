export async function POST(request: Request) {
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
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
  } else {
    console.log("application received (no SUBMIT_WEBHOOK_URL set):", data);
  }

  return Response.json({ ok: true });
}
