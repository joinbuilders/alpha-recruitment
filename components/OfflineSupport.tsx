"use client";

import { useEffect } from "react";
import { startOutbox, usePendingCount } from "@/lib/outbox";

/**
 * Everything that keeps the site usable on venue Wi-Fi, in one place:
 * registers the service worker that caches the shell, starts the outbox's
 * retry loop, and shows whether anything is still waiting to reach the server.
 */
export default function OfflineSupport() {
  useEffect(() => startOutbox(), []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // A cached shell in front of `next dev` serves stale chunks and looks like
    // a broken build, so the worker is production-only — and any copy left
    // over from a production visit on this origin gets removed.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }

    // After load, so precaching doesn't compete with the first screen's assets.
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((e) => console.error("service worker registration failed:", e));
    };
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return <PendingSync />;
}

/**
 * Only visible when a claim or hand-out is sitting in the outbox. Tells staff
 * the answers are safe on the device and haven't reached the server yet —
 * without implying to the applicant that anything went wrong.
 */
function PendingSync() {
  const pending = usePendingCount();
  if (pending === 0) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-6 right-6 z-30 flex animate-[fadein_0.4s_ease_both] items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-[10px] tracking-[.18em] text-white/75 backdrop-blur-md"
    >
      <span className="inline-block h-1.5 w-1.5 animate-[blink_1.6s_infinite] rounded-full bg-white/70" />
      SAVED · WILL SYNC
    </div>
  );
}
