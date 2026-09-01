import { Resolver } from "node:dns/promises";

// A domain with no mail records guarantees a bounce, and domain typos
// (osu.eud, gmal.com) are the most common cause. Checking MX up front lets
// /api/apply send the applicant back to fix the typo instead of storing a
// dead address and bouncing the confirmation email.
//
// Short timeout, fail open: a DNS hiccup must never block a real applicant.
const resolver = new Resolver({ timeout: 2000, tries: 1 });

// Fluid Compute reuses instances, so at an event most submissions share a
// handful of domains (osu.edu, gmail.com) and hit this cache. Definitive
// answers only — fail-open results are never cached.
const cache = new Map<string, boolean>();
const CACHE_MAX = 5000;

// true = records exist, false = definitively none, null = DNS unavailable
async function lookup(
  query: () => Promise<unknown[]>
): Promise<boolean | null> {
  try {
    const records = await query();
    return records.length > 0;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") return false;
    return null;
  }
}

export async function emailDomainAcceptsMail(email: string): Promise<boolean> {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  const cached = cache.get(domain);
  if (cached !== undefined) return cached;

  let result: boolean | null;
  try {
    const mx = await resolver.resolveMx(domain);
    // A single "." exchange is a null MX (RFC 7505): the domain exists but
    // explicitly refuses mail.
    result = mx.some((r) => r.exchange && r.exchange !== ".");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND") {
      result = false; // domain doesn't exist
    } else if (code === "ENODATA") {
      // No MX at all — mail servers fall back to the A/AAAA record (RFC 5321).
      const a = await lookup(() => resolver.resolve4(domain));
      const aaaa = a ? true : await lookup(() => resolver.resolve6(domain));
      result = a === null && aaaa === null ? null : a === true || aaaa === true;
    } else {
      result = null; // resolver unreachable or timed out
    }
  }

  if (result === null) return true;
  if (cache.size < CACHE_MAX) cache.set(domain, result);
  return result;
}
