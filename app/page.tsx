"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Starfield from "@/components/Starfield";
import BuildersLogo from "@/components/BuildersLogo";

const FLASH_PHRASES = [
  "Dinner Series",
  "Hackathons",
  "Founder Trips",
  "Hacker Houses",
  "Speaker Series",
  "Venture Capital",
  "Startup Internships",
  "Ordinary was never the goal.",
];

const KEY_CLAIMED = "bld_claimed";
const KEY_REDEEMED = "bld_redeemed";
const KEY_PROGRESS = "bld_progress";
const KEY_SEEN = "bld_seen";

type Phase =
  | "boot"
  | "flash"
  | "film"
  | "intro"
  | "name"
  | "email"
  | "claimed"
  | "redeemed";

type ClaimedRec = { name: string; email: string; time: string };

function read<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [flashIdx, setFlashIdx] = useState(0);
  const [hasFilm, setHasFilm] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<{ field: "name" | "email"; msg: string } | null>(null);
  const [claimedRec, setClaimedRec] = useState<ClaimedRec | null>(null);
  const [redeemedAt, setRedeemedAt] = useState<string | null>(null);
  const [clock, setClock] = useState("");
  const [holding, setHolding] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------- boot: restore device state ---------- */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("reset")) {
      [KEY_CLAIMED, KEY_REDEEMED, KEY_PROGRESS, KEY_SEEN].forEach((k) =>
        localStorage.removeItem(k)
      );
      window.history.replaceState(null, "", window.location.pathname);
    }

    const redeemed = read<{ time: string }>(KEY_REDEEMED);
    const claimed = read<ClaimedRec>(KEY_CLAIMED);
    if (claimed) setClaimedRec(claimed);
    if (redeemed && claimed) {
      setRedeemedAt(redeemed.time);
      setPhase("redeemed");
      return;
    }
    if (claimed) {
      setPhase("claimed");
      return;
    }
    const prog = read<{ step: number; name: string; email: string }>(KEY_PROGRESS);
    if (prog) {
      setName(prog.name || "");
      setEmail(prog.email || "");
      setPhase(prog.step >= 2 ? "email" : "name");
      return;
    }
    if (localStorage.getItem(KEY_SEEN)) {
      setPhase("intro");
      return;
    }
    setPhase("flash");
  }, []);

  /* ---------- does /film.mp4 exist? ---------- */
  useEffect(() => {
    fetch("/film.mp4", { method: "HEAD" })
      .then((r) => setHasFilm(r.ok))
      .catch(() => setHasFilm(false));
  }, []);

  const toIntro = useCallback(() => {
    localStorage.setItem(KEY_SEEN, "1");
    setPhase("intro");
  }, []);

  /* ---------- flash sequence ---------- */
  useEffect(() => {
    if (phase !== "flash") return;
    const isLast = flashIdx === FLASH_PHRASES.length - 1;
    const t = setTimeout(
      () => {
        if (!isLast) {
          setFlashIdx((i) => i + 1);
        } else if (hasFilm) {
          setPhase("film");
        } else {
          toIntro();
        }
      },
      isLast ? 1500 : 550
    );
    return () => clearTimeout(t);
  }, [phase, flashIdx, hasFilm, toIntro]);

  /* ---------- progress persistence ---------- */
  useEffect(() => {
    if (phase !== "name" && phase !== "email") return;
    localStorage.setItem(
      KEY_PROGRESS,
      JSON.stringify({ step: phase === "email" ? 2 : 1, name, email })
    );
  }, [phase, name, email]);

  /* ---------- focus the step's field when it opens ---------- */
  useEffect(() => {
    if (phase !== "name" && phase !== "email") return;
    const input = phase === "name" ? nameRef.current : emailRef.current;
    const t = setTimeout(() => input?.focus(), 450);
    return () => clearTimeout(t);
  }, [phase]);

  /* ---------- live clock on the green screen ---------- */
  useEffect(() => {
    if (phase !== "claimed") return;
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [phase]);

  const flagErr = (field: "name" | "email", msg: string) => {
    setErr({ field, msg });
    if (errTimer.current) clearTimeout(errTimer.current);
    errTimer.current = setTimeout(() => setErr(null), 1600);
  };

  const nextFromName = () => {
    if (!name.trim()) return flagErr("name", "WE NEED A NAME");
    setPhase("email");
  };

  const submit = () => {
    if (read(KEY_REDEEMED) || read(KEY_CLAIMED)) return; // hard block on double-claim
    if (!name.trim()) return setPhase("name");
    if (!/.+@.+\..+/.test(email.trim())) return flagErr("email", "NEEDS A VALID EMAIL");
    const rec: ClaimedRec = {
      name: name.trim(),
      email: email.trim(),
      time: new Date().toISOString(),
    };
    localStorage.setItem(KEY_CLAIMED, JSON.stringify(rec));
    localStorage.removeItem(KEY_PROGRESS);
    setClaimedRec(rec);
    setPhase("claimed");
    fetch("/api/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rec),
      keepalive: true,
    }).catch(() => {});
  };

  /* ---------- staff hold-to-redeem ---------- */
  const redeem = useCallback(() => {
    setHolding(false);
    const time = new Date().toISOString();
    localStorage.setItem(KEY_REDEEMED, JSON.stringify({ time }));
    setRedeemedAt(time);
    setPhase("redeemed");
  }, []);

  const holdStart = (e: React.PointerEvent) => {
    e.preventDefault();
    setHolding(true);
    holdTimer.current = setTimeout(redeem, 900);
  };
  const holdEnd = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setHolding(false);
  };

  const skip = () => {
    if (phase === "flash" || phase === "film") toIntro();
  };

  const barWidth = phase === "name" ? "50%" : phase === "email" ? "100%" : "0%";

  return (
    <main className="fixed inset-0 overflow-hidden font-mono" onClick={skip}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/night-sky.png"
        alt=""
        className="fixed inset-0 z-0 h-full w-full object-cover"
      />
      <Starfield className="fixed inset-0 z-0" />

      {/* the film */}
      {hasFilm && phase === "film" && (
        <video
          src="/film.mp4"
          muted
          autoPlay
          playsInline
          onEnded={toIntro}
          onError={() => {
            setHasFilm(false);
            toIntro();
          }}
          className="fixed inset-0 z-[1] h-full w-full object-cover"
        />
      )}

      {/* the film's final frame holds behind the intro headline */}
      {phase === "intro" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/rooftop.jpg"
          alt=""
          className="fixed inset-0 z-[1] h-full w-full object-cover opacity-55"
        />
      )}

      <div className="pointer-events-none fixed inset-0 z-[2] bg-[radial-gradient(ellipse_at_50%_40%,rgba(0,0,0,0)_0%,rgba(0,0,0,.75)_70%,#000_100%)]" />

      {/* red bar + unclaimed pill */}
      <div
        className="fixed left-0 top-0 z-20 h-[2px] bg-brand transition-all duration-500"
        style={{ width: barWidth }}
      />

      <BuildersLogo className="fixed bottom-6 left-7 z-20 h-[18px] w-auto text-white" />

      {/* ---------- flash text ---------- */}
      {phase === "flash" && (
        <section className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center">
          <p
            key={flashIdx}
            className="text-[clamp(22px,4.5vw,44px)] font-medium tracking-wide text-white"
          >
            {FLASH_PHRASES[flashIdx]}
          </p>
        </section>
      )}

      {/* ---------- intro / start of application ---------- */}
      {phase === "intro" && (
        <section className="absolute inset-0 z-10 flex animate-[rise_0.6s_ease] flex-col items-center justify-center px-6 text-center">
          <h1 className="font-serif text-[clamp(44px,8vw,92px)] leading-[1.05] text-white">
            Your building
            <br />
            starts <em className="italic">today.</em>
          </h1>
          <button
            onClick={() => setPhase("name")}
            className="mt-11 h-[52px] cursor-pointer rounded-[6px] bg-brand px-10 text-sm font-bold tracking-[.2em] text-white shadow-[6px_6px_15px_0px_rgba(0,9,6,0.1)] transition hover:brightness-110 active:scale-[.98]"
          >
            BEGIN APPLICATION
          </button>
        </section>
      )}

      {/* ---------- question 1: name ---------- */}
      {phase === "name" && (
        <section className="absolute inset-0 z-10 flex animate-[rise_0.5s_ease] flex-col items-center justify-center px-5 text-center">
          <h2 className="mb-9 max-w-[820px] font-serif text-[clamp(32px,5vw,56px)] leading-[1.1] text-white">
            What should we call you?
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              nextFromName();
            }}
            className="w-full max-w-[704px] rounded-[6px] bg-[#0d0f0d] px-5 pb-8 pt-7 text-left sm:px-[30px] sm:pb-10 sm:pt-8"
          >
            <label
              htmlFor="name"
              className="block text-[clamp(16px,1.7vw,22px)] font-bold text-white"
            >
              Full Name
            </label>
            <input
              id="name"
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              autoComplete="name"
              enterKeyHint="next"
              className={`mt-2.5 h-[53px] w-full rounded-[6px] border-2 bg-[rgba(217,217,217,0.91)] px-4 text-[17px] text-[#0d0f0d] shadow-[6px_6px_15px_0px_rgba(0,9,6,0.1)] outline-none transition-colors placeholder:text-black/35 focus:bg-white ${
                err?.field === "name" ? "border-brand" : "border-[#f0f0f0]"
              }`}
            />
            <button
              type="submit"
              className="mt-10 h-[52px] w-full cursor-pointer rounded-[6px] bg-brand text-[15px] font-bold tracking-[.2em] text-white shadow-[6px_6px_15px_0px_rgba(0,9,6,0.1)] transition hover:brightness-110 active:scale-[.99]"
            >
              NEXT
            </button>
            <p className="mt-4 min-h-[17px] text-center text-[11px] tracking-[.15em] text-brand">
              {err?.field === "name" ? err.msg : ""}
            </p>
          </form>
        </section>
      )}

      {/* ---------- question 2: email ---------- */}
      {phase === "email" && (
        <section className="absolute inset-0 z-10 flex animate-[rise_0.5s_ease] flex-col items-center justify-center px-5 text-center">
          <h2 className="mb-9 max-w-[820px] font-serif text-[clamp(32px,5vw,56px)] leading-[1.1] text-white">
            Where do we reach you?
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="w-full max-w-[704px] rounded-[6px] bg-[#0d0f0d] px-5 pb-8 pt-7 text-left sm:px-[30px] sm:pb-10 sm:pt-8"
          >
            <label
              htmlFor="email"
              className="block text-[clamp(16px,1.7vw,22px)] font-bold text-white"
            >
              Email
            </label>
            <input
              id="email"
              ref={emailRef}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name.#@osu.edu"
              type="email"
              autoComplete="email"
              inputMode="email"
              enterKeyHint="go"
              className={`mt-2.5 h-[53px] w-full rounded-[6px] border-2 bg-[rgba(217,217,217,0.91)] px-4 text-[17px] text-[#0d0f0d] shadow-[6px_6px_15px_0px_rgba(0,9,6,0.1)] outline-none transition-colors placeholder:text-black/35 focus:bg-white ${
                err?.field === "email" ? "border-brand" : "border-[#f0f0f0]"
              }`}
            />
            <button
              type="submit"
              className="mt-10 h-[52px] w-full cursor-pointer rounded-[6px] bg-brand text-[15px] font-bold tracking-[.2em] text-white shadow-[6px_6px_15px_0px_rgba(0,9,6,0.1)] transition hover:brightness-110 active:scale-[.99]"
            >
              SUBMIT
            </button>
            <p className="mt-4 min-h-[17px] text-center text-[11px] tracking-[.15em] text-brand">
              {err?.field === "email" ? err.msg : ""}
            </p>
          </form>
        </section>
      )}

      {/* ---------- green: filled out, item owed ---------- */}
      {phase === "claimed" && (
        <section
          onPointerDown={holdStart}
          onPointerUp={holdEnd}
          onPointerCancel={holdEnd}
          onPointerLeave={holdEnd}
          className="absolute inset-0 z-10 flex animate-[rise_0.5s_ease] touch-none select-none flex-col items-center justify-center bg-claim px-6 text-center text-white [-webkit-touch-callout:none]"
        >
          <div className="pointer-events-none absolute inset-0 animate-[glow_2.4s_ease-in-out_infinite] bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,.28),transparent_60%)]" />
          <div className="mb-8 flex h-[88px] w-[88px] items-center justify-center rounded-full border-4 border-white text-[44px]">
            ✓
          </div>
          <p className="font-serif text-[clamp(60px,13vw,150px)] leading-[.95]">
            You&apos;re <em className="italic">in.</em>
          </p>
          <p className="mt-6 text-[clamp(15px,2.5vw,22px)] uppercase tracking-[.22em]">
            {claimedRec?.name}
          </p>
          <div className="mt-8 flex items-center gap-2.5 text-[13px] tracking-[.2em]">
            <span className="inline-block h-2 w-2 animate-[blink_1.2s_infinite] rounded-full bg-white" />
            <span>LIVE</span>
            <span>{clock}</span>
          </div>
          <p className="mt-9 text-[10px] tracking-[.28em] text-white/40">
            STAFF · HOLD SCREEN TO REDEEM
          </p>
          {/* green fades to black under the staff member's thumb */}
          <div
            className={`pointer-events-none absolute inset-0 bg-black ${
              holding
                ? "opacity-100 transition-opacity duration-[900ms] ease-linear"
                : "opacity-0 transition-opacity duration-150"
            }`}
          />
        </section>
      )}

      {/* ---------- dark: already got their item ---------- */}
      {phase === "redeemed" && (
        <section className="absolute inset-0 z-10 flex animate-[rise_0.5s_ease] flex-col items-center justify-center px-6 text-center">
          <div className="mb-8 flex h-[88px] w-[88px] items-center justify-center rounded-full border-[3px] border-claim text-[42px] text-claim">
            ✓
          </div>
          <p className="font-serif text-[clamp(48px,10vw,120px)] leading-[.98] text-claim">
            Already <em className="italic">claimed.</em>
          </p>
          <p className="mt-6 text-[clamp(14px,2.2vw,20px)] uppercase tracking-[.22em] text-white">
            {claimedRec?.name}
          </p>
          {redeemedAt && (
            <p className="mt-3 text-xs tracking-[.2em] text-ink/45">
              {new Date(redeemedAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
