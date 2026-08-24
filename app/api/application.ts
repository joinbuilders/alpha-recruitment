// Mirrors the client-side checks and the DB constraints on public.applications,
// so anything accepted here can't fail the table's CHECKs. Shared by /api/apply
// and /api/redeem.
export function parseApplication(data: unknown) {
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
