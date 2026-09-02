"use client";

import { useSyncExternalStore } from "react";

/**
 * Durable outbox for the two writes this site makes: the claim
 * (POST /api/apply) and the staff hand-out (POST /api/redeem).
 *
 * Venue Wi-Fi drops constantly, so nothing is sent straight from a click.
 * Every write is written to localStorage first, then delivered; it leaves the
 * queue only once the server has actually accepted it (or told us it never
 * will). A device that claims in a dead corner of the room still delivers the
 * lead when it walks back into signal — or on the next page load, hours later.
 */

export type OutboxKind = "apply" | "redeem";

export type OutboxItem = {
  id: string;
  kind: OutboxKind;
  name: string;
  email: string;
  time: string;
  queuedAt: string;
  /** Diagnostic only — read `bld_outbox` in the console to see a stuck device. */
  tries: number;
};

export type Payload = { name: string; email: string; time: string };

/** What happened to a claim we tried to deliver while the applicant waits. */
export type ClaimOutcome = "recorded" | "duplicate" | "undeliverable" | "queued";

export const KEY_OUTBOX = "bld_outbox";
const SEND_TIMEOUT_MS = 8000;
const RETRY_INTERVAL_MS = 15000;
/** Far above the 1–2 items a real device holds; a guard, not a policy. */
const MAX_ITEMS = 50;

const ENDPOINT: Record<OutboxKind, string> = {
  apply: "/api/apply",
  redeem: "/api/redeem",
};

/* ---------- storage ---------- */

// Mirrors localStorage so React can read a stable snapshot, and so a device
// with storage disabled (iOS private browsing) still queues for this session.
let items: OutboxItem[] | null = null;
const listeners = new Set<() => void>();

function list(): OutboxItem[] {
  if (items) return items;
  if (typeof window === "undefined") return (items = []);
  try {
    const raw = localStorage.getItem(KEY_OUTBOX);
    const parsed = raw ? JSON.parse(raw) : [];
    items = Array.isArray(parsed) ? (parsed as OutboxItem[]) : [];
  } catch {
    items = [];
  }
  return items;
}

function save(next: OutboxItem[]) {
  items = next;
  try {
    localStorage.setItem(KEY_OUTBOX, JSON.stringify(next));
  } catch {
    // Full or disabled storage — the in-memory queue still drains this session.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Number of writes still waiting on the network. Drives the sync indicator. */
export function usePendingCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => list().length,
    () => 0
  );
}

/** Drops everything queued. Only used by the `?reset=1` testing path. */
export function clearOutbox() {
  save([]);
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function enqueue(kind: OutboxKind, rec: Payload): OutboxItem {
  const item: OutboxItem = { id: newId(), kind, ...rec, queuedAt: new Date().toISOString(), tries: 0 };
  // One entry per kind+email: a double-tap must not become two rows.
  const key = rec.email.trim().toLowerCase();
  const rest = list().filter(
    (i) => !(i.kind === kind && i.email.trim().toLowerCase() === key)
  );
  save([...rest, item].slice(-MAX_ITEMS));
  return item;
}

function remove(id: string) {
  save(list().filter((i) => i.id !== id));
}

function bumpTries(id: string) {
  save(list().map((i) => (i.id === id ? { ...i, tries: i.tries + 1 } : i)));
}

/* ---------- delivery ---------- */

type Outcome =
  /** Server stored it. */
  | "sent"
  /** 409: this email already claimed, here or on another device. */
  | "duplicate"
  /** 400: the server will never accept this payload. Dropping it is the only exit. */
  | "rejected"
  /** 422: the email's domain can't receive mail. Retrying can't change that. */
  | "undeliverable"
  /** Network error, timeout, or a server-side fault. Keep it and retry. */
  | "failed";

function isOnline(): boolean {
  // navigator.onLine only knows about the network interface — it stays true on
  // a captive portal — so it is trusted for "definitely offline" and nothing else.
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

async function deliver(item: OutboxItem): Promise<Outcome> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT[item.kind], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: item.name, email: item.email, time: item.time }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch {
    return "failed";
  }
  if (res.ok) return "sent";
  if (res.status === 409) return "duplicate";
  if (res.status === 422) return "undeliverable";
  if (res.status === 400) {
    console.error("outbox: server rejected", item.kind, "payload; dropping");
    return "rejected";
  }
  // 5xx — Supabase down or env vars missing. Worth retrying.
  return "failed";
}

let flushing = false;

/** Delivers everything queued. Safe to call as often as you like. */
export async function flush(): Promise<void> {
  if (flushing || !list().length || !isOnline()) return;
  flushing = true;
  try {
    for (const item of [...list()]) {
      const outcome = await deliver(item);
      if (outcome === "failed") {
        // Still unreachable. Stop here rather than hammering a dead network;
        // the next trigger picks up where we left off.
        bumpTries(item.id);
        break;
      }
      remove(item.id);
    }
  } finally {
    flushing = false;
  }
}

/* ---------- the two writes ---------- */

/**
 * Records the claim. Waits on the server only long enough to catch an email
 * that already claimed on another device — if the network is down or slow, the
 * claim is queued and the applicant walks through, rather than being stranded
 * on venue Wi-Fi.
 */
export async function submitApplication(rec: Payload): Promise<ClaimOutcome> {
  const item = enqueue("apply", rec);
  if (!isOnline()) return "queued";
  // Held so the retry timer can't deliver this same item alongside us.
  flushing = true;
  let outcome: Outcome;
  try {
    outcome = await deliver(item);
  } finally {
    flushing = false;
  }
  if (outcome === "failed") return "queued";
  remove(item.id);
  if (outcome === "duplicate") return "duplicate";
  if (outcome === "undeliverable") return "undeliverable";
  return "recorded";
}

/**
 * Records a staff hand-out. Never awaited — staff shouldn't stand around
 * waiting on the network — but it is durable, so the audit record survives a
 * dead connection and a closed tab.
 */
export function queueRedemption(rec: Payload): void {
  enqueue("redeem", rec);
  void flush();
}

/* ---------- retry triggers ---------- */

let started = false;

/** Wires up the retry triggers. Idempotent; called once on mount. */
export function startOutbox(): () => void {
  if (started || typeof window === "undefined") return () => {};
  started = true;

  const onOnline = () => void flush();
  const onVisible = () => {
    if (document.visibilityState === "visible") void flush();
  };
  // A last-ditch send for anything still queued when the tab goes away. We
  // can't read the result, so items stay queued and may be delivered twice —
  // harmless: /api/apply 409s on the duplicate and the redeem RPC is idempotent.
  const onPageHide = () => {
    if (!navigator.sendBeacon || !isOnline()) return;
    for (const item of list()) {
      try {
        navigator.sendBeacon(
          ENDPOINT[item.kind],
          new Blob(
            [JSON.stringify({ name: item.name, email: item.email, time: item.time })],
            { type: "application/json" }
          )
        );
      } catch {
        // Beacon queue full — the normal retry path still has the item.
      }
    }
  };

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pagehide", onPageHide);
  const timer = setInterval(() => void flush(), RETRY_INTERVAL_MS);

  void flush();

  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("pagehide", onPageHide);
    clearInterval(timer);
    started = false;
  };
}
