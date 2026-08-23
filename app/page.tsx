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

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

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
      isLast ? 1000 : 300
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

  const submit = () => {
    if (read(KEY_CLAIMED)) return; // hard block on double-claim
    if (!name.trim()) return setPhase("name");
    if (!/.+@.+\..+/.test(email.trim()))
      return setErr({ field: "email", msg: "That email doesn't look right." });
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
        <section className="absolute inset-0 z-10 flex animate-[rise_0.5s_ease] flex-col items-center justify-center bg-claim px-6 text-center text-white">
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
        </section>
      )}
    </main>
  );
}

/* ---------- one question step: serif headline + glass card ---------- */
function QuestionStep({
  step,
  title,
  label,
  buttonText,
  errMsg,
  onSubmit,
  inputRef,
  inputProps,
}: {
  step: 1 | 2;
  title: string;
  label: string;
  buttonText: string;
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
          className="mt-3 h-[48px] w-full cursor-pointer rounded-[8px] bg-brand text-[13px] font-bold tracking-[.15em] text-white transition hover:brightness-110 active:scale-[.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
        >
          {buttonText}
        </button>
      </form>
    </section>
  );
}
