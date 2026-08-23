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
];

const KEY_CLAIMED = "bld_claimed";
const KEY_PROGRESS = "bld_progress";
const KEY_SEEN = "bld_seen";

type Phase =
  | "boot"
  | "flash"
  | "film"
  | "intro"
  | "name"
  | "email"
  | "claimed";

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
  const [clock, setClock] = useState("");
  const [filmStarted, setFilmStarted] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const errTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------- boot: restore device state ---------- */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("reset")) {
      [KEY_CLAIMED, KEY_PROGRESS, KEY_SEEN].forEach((k) =>
        localStorage.removeItem(k)
      );
      window.history.replaceState(null, "", window.location.pathname);
    }

    const claimed = read<ClaimedRec>(KEY_CLAIMED);
    if (claimed) {
      setClaimedRec(claimed);
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

  /* ---------- flash sequence: phrases, then the logo ---------- */
  useEffect(() => {
    if (phase !== "flash") return;
    const isLogo = flashIdx === FLASH_PHRASES.length;
    const t = setTimeout(
      () => {
        if (!isLogo) {
          setFlashIdx((i) => i + 1);
        } else if (hasFilm) {
          setPhase("film"); // logo stays up and fades over the film's opening
        } else {
          toIntro();
        }
      },
      isLogo ? (hasFilm ? 800 : 1600) : 300
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
    if (read(KEY_CLAIMED)) return; // hard block on double-claim
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

  const skip = () => {
    if (phase === "flash" || phase === "film") toIntro();
  };

  const barWidth = phase === "name" ? "50%" : phase === "email" ? "100%" : "0%";

  // hidden through boot/flash; fades in as the centered logo fades out over the film
  const cornerLogoIn =
    phase === "film" ? filmStarted : phase !== "boot" && phase !== "flash";

  return (
    <main className="fixed inset-0 overflow-hidden font-mono" onClick={skip}>
      {/* deep-blue sky gradient; the png's black blends away via screen, keeping its stars */}
      <div className="fixed inset-0 z-0 bg-[radial-gradient(130%_100%_at_50%_112%,#1d3a66_0%,#13234a_32%,#0b1430_65%,#060b1e_100%)]" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(60%_45%_at_78%_8%,rgba(88,62,138,.3),transparent_70%)]" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/night-sky.png"
        alt=""
        className="fixed inset-0 z-0 h-full w-full object-cover mix-blend-screen"
      />
      <Starfield className="fixed inset-0 z-0" />

      {/* the film */}
      {hasFilm && phase === "film" && (
        <video
          src="/film.mp4"
          muted
          autoPlay
          playsInline
          onPlay={() => setFilmStarted(true)}
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

      <div className="pointer-events-none fixed inset-0 z-[2] bg-[radial-gradient(ellipse_at_50%_40%,rgba(4,7,20,0)_0%,rgba(4,7,20,.5)_70%,rgba(4,8,24,.8)_100%)]" />

      {/* red bar + unclaimed pill */}
      <div
        className="fixed left-0 top-0 z-20 h-[2px] bg-brand transition-all duration-500"
        style={{ width: barWidth }}
      />

      <BuildersLogo
        className={`fixed bottom-6 left-7 z-20 h-[18px] w-auto text-white transition-opacity duration-[2500ms] ${
          cornerLogoIn ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* ---------- flash text ---------- */}
      {phase === "flash" && (
        <section className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center">
          {flashIdx < FLASH_PHRASES.length ? (
            <p
              key={flashIdx}
              className="text-[clamp(22px,4.5vw,44px)] font-medium tracking-wide text-white"
            >
              {FLASH_PHRASES[flashIdx]}
            </p>
          ) : (
            <BuildersLogo
              className={`h-[clamp(28px,5vw,52px)] w-auto text-white ${
                hasFilm ? "" : "animate-[fadeout_0.9s_ease_0.7s_both]"
              }`}
            />
          )}
        </section>
      )}

      {/* the logo lingers over the film's first 2.5s, slowly fading away */}
      {phase === "film" && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
          <BuildersLogo
            className={`h-[clamp(28px,5vw,52px)] w-auto text-white ${
              filmStarted ? "animate-[fadeout_2.5s_ease_both]" : ""
            }`}
          />
        </div>
      )}

      {/* ---------- intro / start of application ---------- */}
      {phase === "intro" && (
        <section className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center">
          <h1 className="animate-[fadein_1.1s_ease_both] font-serif text-[clamp(44px,8vw,92px)] leading-[1.05] text-white">
            Your building
            <br />
            starts <em className="italic">today.</em>
          </h1>
          <button
            onClick={() => setPhase("name")}
            className="mt-11 h-[52px] animate-[fadein_1.1s_ease_0.45s_both] cursor-pointer rounded-[6px] bg-brand px-10 text-sm font-bold tracking-[.2em] text-white shadow-[6px_6px_15px_0px_rgba(0,9,6,0.1)] transition hover:brightness-110 active:scale-[.98]"
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
        <section className="absolute inset-0 z-10 flex animate-[rise_0.5s_ease] flex-col items-center justify-center bg-claim px-6 text-center text-white">
          <div className="pointer-events-none absolute inset-0 animate-[glow_2.4s_ease-in-out_infinite] bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,.28),transparent_60%)]" />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="mb-8 h-[88px] w-[88px]"
          >
            <desc>Form Validation Check Circle Streamline Icon: https://streamlinehq.com</desc>
            <g>
              <path
                d="M20.06 12.45a0.35 0.35 0 0 0 -0.26 0.41 6.88 6.88 0 0 1 -0.43 4.14 8.59 8.59 0 0 1 -2.55 3.34 11.7 11.7 0 0 1 -6.41 2.53A8.79 8.79 0 0 1 4 21a7 7 0 0 1 -2.44 -5.64 10.19 10.19 0 0 1 2.15 -6.1 7.93 7.93 0 0 1 5 -3.11 4.11 4.11 0 0 1 3.56 1.32 0.29 0.29 0 0 0 0.42 0 0.3 0.3 0 0 0 0 -0.42 4.76 4.76 0 0 0 -4.04 -1.62A8.81 8.81 0 0 0 3 8.67a11.06 11.06 0 0 0 -2.54 6.62 8 8 0 0 0 2.81 6.56A9.86 9.86 0 0 0 10.5 24a12.61 12.61 0 0 0 6.89 -2.9 9.39 9.39 0 0 0 2.71 -3.8 7.59 7.59 0 0 0 0.37 -4.59 0.34 0.34 0 0 0 -0.41 -0.26Z"
                fill="currentColor"
                fillRule="evenodd"
                strokeWidth="1"
              />
              <path
                d="M23.2 0c-0.24 0 -0.2 0.09 -0.86 1 -1.05 1.5 -3.41 4.63 -5.63 7.67 -1.6 2.17 -3.13 4.3 -4.17 5.67a12.59 12.59 0 0 1 -1.15 1.42c-0.07 0.06 -0.16 0 -0.26 0a2.76 2.76 0 0 1 -0.8 -0.43 18.37 18.37 0 0 1 -2.84 -2.93c-0.35 -0.43 -0.45 -0.69 -0.68 -0.51s-0.35 0.16 -0.2 0.38l0.21 0.3a24.85 24.85 0 0 0 2.31 2.82 5.26 5.26 0 0 0 1.63 1.22 1.22 1.22 0 0 0 1.24 -0.04 18.55 18.55 0 0 0 2.16 -2.46c0.82 -1.06 1.81 -2.38 2.81 -3.78 2.35 -3.29 4.81 -7 5.94 -8.79a6.77 6.77 0 0 0 0.67 -1.2 0.35 0.35 0 0 0 -0.38 -0.34Z"
                fill="currentColor"
                fillRule="evenodd"
                strokeWidth="1"
              />
            </g>
          </svg>
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
        </section>
      )}
    </main>
  );
}
