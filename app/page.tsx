"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type RefObject,
} from "react";
import Starfield from "@/components/Starfield";
import BuildersLogo from "@/components/BuildersLogo";
import { clearOutbox, queueRedemption, submitApplication } from "@/lib/outbox";

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
  const [filmStarted, setFilmStarted] = useState(false);
  const [holding, setHolding] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------- boot: restore device state ---------- */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("reset")) {
      [KEY_CLAIMED, KEY_REDEEMED, KEY_PROGRESS, KEY_SEEN].forEach((k) =>
        localStorage.removeItem(k)
      );
      clearOutbox();
      window.history.replaceState(null, "", window.location.pathname);
    }

    const redeemed = read<{ time: string }>(KEY_REDEEMED);
    const claimed = read<ClaimedRec>(KEY_CLAIMED);
    if (claimed) {
      setClaimedRec(claimed);
      if (redeemed) {
        setRedeemedAt(redeemed.time);
        setPhase("redeemed");
      } else {
        setPhase("claimed");
      }
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
    // 25 MB over venue Wi-Fi isn't worth waiting on: no connection, or a probe
    // that can't answer in 2s, and we go straight to the application.
    const probe =
      navigator.onLine === false
        ? Promise.resolve(false)
        : fetch("/film.mp4", {
            method: "HEAD",
            signal: AbortSignal.timeout(2000),
          }).then((r) => r.ok);
    probe.then(setHasFilm).catch(() => setHasFilm(false));
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

  // errors stay visible until the visitor types again
  const nextFromName = () => {
    if (!name.trim())
      return setErr({ field: "name", msg: "We need a name." });
    setPhase("email");
  };

  const submit = async () => {
    if (submitting) return;
    if (read(KEY_REDEEMED) || read(KEY_CLAIMED)) return; // hard block on double-claim
    if (!name.trim()) return setPhase("name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()))
      return setErr({ field: "email", msg: "That email doesn't look right." });
    const rec: ClaimedRec = {
      name: name.trim(),
      email: email.trim(),
      time: new Date().toISOString(),
    };
    // The answers are queued before anything is sent, so they survive a dead
    // network and a closed tab. We wait on the server only long enough to
    // catch an email that already claimed on another device — when it's
    // unreachable, the claim goes through and the outbox delivers it later.
    // Better a rare double hand-out than an applicant stranded on venue Wi-Fi.
    setSubmitting(true);
    const outcome = await submitApplication(rec);
    setSubmitting(false);
    if (outcome === "duplicate") {
      return setErr({
        field: "email",
        msg: "That email already claimed — see a Builders team member.",
      });
    }
    // Server checked DNS: the domain can't receive mail, so it's a typo.
    if (outcome === "undeliverable") {
      return setErr({
        field: "email",
        msg: "We can't deliver to that address — check for typos.",
      });
    }
    localStorage.setItem(KEY_CLAIMED, JSON.stringify(rec));
    localStorage.removeItem(KEY_PROGRESS);
    setClaimedRec(rec);
    setPhase("claimed");
  };

  /* ---------- staff hold-to-redeem ---------- */
  const redeem = useCallback(() => {
    setHolding(false);
    const time = new Date().toISOString();
    localStorage.setItem(KEY_REDEEMED, JSON.stringify({ time }));
    setRedeemedAt(time);
    setPhase("redeemed");
    // Record the hand-out server-side, without making staff wait on it. The
    // outbox retries until it lands, so a redemption in a dead corner of the
    // room still shows up in Supabase.
    const rec = claimedRec ?? read<ClaimedRec>(KEY_CLAIMED);
    if (rec) queueRedemption({ name: rec.name, email: rec.email, time });
  }, [claimedRec]);

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
        <QuestionStep
          step={1}
          title="What should we call you?"
          label="Full Name"
          buttonText="NEXT"
          errMsg={err?.field === "name" ? err.msg : null}
          onSubmit={nextFromName}
          inputRef={nameRef}
          inputProps={{
            id: "name",
            value: name,
            onChange: (e) => {
              setName(e.target.value);
              setErr(null);
            },
            placeholder: "Jane Smith",
            autoComplete: "name",
            enterKeyHint: "next",
          }}
        />
      )}

      {/* ---------- question 2: email ---------- */}
      {phase === "email" && (
        <QuestionStep
          step={2}
          title="Where do we reach you?"
          label="Email"
          buttonText="SUBMIT"
          busy={submitting}
          errMsg={err?.field === "email" ? err.msg : null}
          onSubmit={submit}
          inputRef={emailRef}
          inputProps={{
            id: "email",
            type: "email",
            value: email,
            onChange: (e) => {
              setEmail(e.target.value);
              setErr(null);
            },
            placeholder: "name.#@osu.edu",
            autoComplete: "email",
            inputMode: "email",
            enterKeyHint: "go",
          }}
        />
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
          <CheckCircleIcon className="mb-8 h-[clamp(54px,11.5vw,132px)] w-[clamp(54px,11.5vw,132px)]" />
          <p className="font-serif text-[clamp(54px,11.5vw,132px)] leading-[.95]">
            You&apos;re <em className="italic">in.</em>
          </p>
          <p className="mt-6 text-[clamp(15px,2.5vw,22px)] uppercase tracking-[.22em]">
            {claimedRec?.name}
          </p>
          <div className="mt-8 flex items-center gap-2.5 text-[clamp(15px,2.5vw,22px)] tracking-[.2em]">
            <span className="inline-block h-2 w-2 animate-[blink_1.2s_infinite] rounded-full bg-white" />
            <span>LIVE</span>
            <span>{clock}</span>
          </div>
          <p className="mt-9 max-w-[34ch] text-[11px] leading-relaxed tracking-[.24em] text-white/80">
            DO NOT HOLD DOWN ON THIS SCREEN — BRING IT TO A BUILDERS TEAM
            MEMBER TO REDEEM FOR AN ENERGY DRINK
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
          <CheckCircleIcon className="mb-8 h-[clamp(54px,11.5vw,132px)] w-[clamp(54px,11.5vw,132px)] text-white" />
          <p className="font-serif text-[clamp(54px,11.5vw,132px)] leading-[.95] text-white">
            Already <em className="italic">claimed.</em>
          </p>
          <p className="mt-6 text-[clamp(15px,2.5vw,22px)] uppercase tracking-[.22em] text-white">
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

/* ---------- streamline check-circle, shared by the claimed + redeemed screens ---------- */
function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
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
  );
}

/* ---------- one question step: serif headline + glass card ---------- */
function QuestionStep({
  step,
  title,
  label,
  buttonText,
  busy,
  errMsg,
  onSubmit,
  inputRef,
  inputProps,
}: {
  step: 1 | 2;
  title: string;
  label: string;
  buttonText: string;
  busy?: boolean;
  errMsg: string | null;
  onSubmit: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  inputProps: ComponentProps<"input">;
}) {
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <section className="absolute inset-0 z-10 flex animate-[rise_0.5s_ease] flex-col items-center justify-center px-5 text-center">
      <h2 className="mb-9 max-w-[820px] font-serif text-[clamp(32px,5vw,56px)] leading-[1.1] text-white">
        {title}
      </h2>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[520px] rounded-[14px] border border-white/10 bg-[#0b1430]/60 px-6 pb-7 pt-6 text-left shadow-[0_24px_60px_rgba(0,0,0,.45)] backdrop-blur-md sm:px-8 sm:pb-8 sm:pt-7"
      >
        <div className="flex items-baseline justify-between">
          <label
            htmlFor={inputProps.id}
            className="text-[12px] font-medium uppercase tracking-[.18em] text-white/60"
          >
            {label}
          </label>
          <span className="text-[11px] tracking-[.2em] text-white/35">
            {step} / 2
          </span>
        </div>
        <input
          ref={inputRef}
          {...inputProps}
          className={`mt-3 h-[50px] w-full rounded-[8px] border bg-white/5 px-4 text-[17px] text-white caret-brand outline-none transition-colors placeholder:text-white/30 focus:border-white/40 focus:bg-white/10 ${
            errMsg ? "border-brand" : "border-white/15"
          }`}
        />
        <p className="mt-2 min-h-[18px] text-left text-[12.5px] text-brand">
          {errMsg ?? ""}
        </p>
        <button
          type="submit"
          disabled={busy}
          className="mt-3 h-[48px] w-full cursor-pointer rounded-[8px] bg-brand text-[13px] font-bold tracking-[.15em] text-white transition hover:brightness-110 active:scale-[.99] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
        >
          {busy ? "SUBMITTING…" : buttonText}
        </button>
      </form>
    </section>
  );
}
