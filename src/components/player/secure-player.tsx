"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, EyeOff, Languages, Maximize2, Pause, Play, ScanFace, ShieldAlert, Volume2, VolumeX, Smartphone, ArrowRight } from "lucide-react";
import { Button, Spinner } from "@/components/ui";
import { api, ApiFail } from "@/lib/client";
import { fmtDuration } from "@/lib/utils";
import { installWatermark } from "./watermark";

type Grant = {
  streamId: string; token: string; manifestUrl: string; resumeSec: number; durationSec: number;
  tracks: { lang: string; label: string; isDefault: boolean }[];
  security: { pauseOnBlur: boolean; faceVerification: boolean };
  watermark: { name: string; code: string; email: string };
};
type Beat = { conflict?: boolean; token?: string; completed?: boolean; justCompleted?: boolean; pct?: number };
type Phase = "init" | "face" | "loading" | "ready" | "error" | "conflict" | "blocked";
type Props = { videoId: string; courseHref: string; nextHref: string | null; nextLabel: string; alreadyDone: boolean };

const BLOCKED_KEYS = (e: KeyboardEvent) => {
  const k = e.key.toLowerCase(), c = e.ctrlKey || e.metaKey;
  return e.key === "F12" || e.key === "PrintScreen" || (c && ["s", "p", "u"].includes(k)) ||
    (c && e.shiftKey && ["i", "j", "c", "k"].includes(k)) || (e.metaKey && e.shiftKey && ["3", "4", "5"].includes(k));
};

export function SecurePlayer({ videoId, courseHref, nextHref, nextLabel, alreadyDone }: Props) {
  const box = useRef<HTMLDivElement>(null), vid = useRef<HTMLVideoElement>(null);
  const hls = useRef<Hls | null>(null), token = useRef(""), stream = useRef(""), grantRef = useRef<Grant | null>(null);
  const [phase, setPhase] = useState<Phase>("init"), [msg, setMsg] = useState("");
  const [grant, setGrant] = useState<Grant | null>(null), [go, setGo] = useState(false);
  const [paused, setPaused] = useState(true), [cur, setCur] = useState(0), [dur, setDur] = useState(0), [buffering, setBuffering] = useState(true);
  const [vol, setVol] = useState(1), [muted, setMuted] = useState(false), [rate, setRate] = useState(1);
  const [audio, setAudio] = useState<{ id: number; lang: string }[]>([]), [audioIdx, setAudioIdx] = useState(0);
  const [done, setDone] = useState(alreadyDone), [pct, setPct] = useState(0), [justDone, setJustDone] = useState(false);
  const [away, setAway] = useState<string | null>(null), [toast, setToast] = useState<string | null>(null);
  const toastT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastReport = useRef<Record<string, number>>({});

  const flash = useCallback((t: string) => { setToast(t); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(null), 2200); }, []);
  const report = useCallback((type: string, detail?: string) => {
    const now = Date.now(); if (now - (lastReport.current[type] ?? 0) < 5000) return; lastReport.current[type] = now;
    api("/api/security/event", { body: { type, videoId, detail } }).catch(() => {});
  }, [videoId]);

  /* ---------- 1. get a playback grant (auth + enrolment + unlock checks happen server-side) ---------- */
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const g = await api<Grant>(`/api/videos/${videoId}/playback`, { method: "POST" });
        if (dead) return;
        grantRef.current = g; setGrant(g); token.current = g.token; stream.current = g.streamId;
        if (g.security.faceVerification) { // V2 hook: AuthFactor pipeline (stubbed)
          setPhase("face");
          await new Promise((r) => setTimeout(r, 1800));
          await api("/api/auth-factors/verify", { body: { stage: "pre-playback" } });
          if (dead) return;
        }
        setPhase("loading"); setGo(true);
      } catch (e) {
        if (dead) return;
        if (e instanceof ApiFail && e.status === 401) { window.location.href = `/login?reason=${(e.data.reason as string) ?? "expired"}`; return; }
        setMsg(e instanceof ApiFail ? e.message : "Could not start playback"); setPhase("error");
      }
    })();
    return () => { dead = true; };
  }, [videoId]);

  /* ---------- 2. attach hls.js; every request carries the short-lived signed token ---------- */
  useEffect(() => {
    if (!go || !grant || !vid.current) return;
    const v = vid.current;
    if (!Hls.isSupported()) { setMsg("This browser cannot play protected streams. Please use a current Chrome, Edge or Firefox."); setPhase("error"); return; }
    const h = new Hls({
      startPosition: grant.resumeSec, maxBufferLength: 30, enableWorker: true,
      xhrSetup: (xhr, url) => { const u = new URL(url, location.href); u.searchParams.set("t", token.current); xhr.open("GET", u.toString(), true); },
    });
    hls.current = h;
    h.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, d) => setAudio(d.audioTracks.map((t) => ({ id: t.id, lang: t.lang ?? "" }))));
    h.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, d) => setAudioIdx(d.id));
    h.on(Hls.Events.MANIFEST_PARSED, () => { setPhase("ready"); v.play().catch(() => {}); });
    h.on(Hls.Events.ERROR, async (_, d) => {
      if (!d.fatal) return;
      const code = d.response?.code;
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR && (code === 401 || code === 403) && phaseRef.current === "ready") { await beat(); h.startLoad(); return; }
      if (code === 401 || code === 403) { setMsg("Your playback permission expired or this account is signed in elsewhere."); setPhase("error"); return; }
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR) { setTimeout(() => h.startLoad(), 1500); return; }
      if (d.type === Hls.ErrorTypes.MEDIA_ERROR) { h.recoverMediaError(); return; }
      setMsg("Playback failed."); setPhase("error");
    });
    h.loadSource(grant.manifestUrl); h.attachMedia(v);
    return () => { h.destroy(); hls.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go, grant]);

  const phaseRef = useRef<Phase>("init"); phaseRef.current = phase;

  /* ---------- 3. heartbeat: saves progress, refreshes token, detects duplicate streams ---------- */
  const beat = useCallback(async (final = false) => {
    const v = vid.current; if (!v || !stream.current) return;
    try {
      const r = await api<Beat>("/api/progress", { body: { videoId, streamId: stream.current, positionSec: v.currentTime, final } });
      if (r.conflict) { v.pause(); hls.current?.stopLoad(); setPhase("conflict"); return; }
      if (r.token) token.current = r.token;
      if (typeof r.pct === "number") setPct(Math.min(100, r.pct));
      if (r.completed) setDone(true);
      if (r.justCompleted) { setJustDone(true); flash("✔ Video completed"); }
    } catch (e) {
      if (e instanceof ApiFail && e.status === 401) { v.pause(); window.location.href = `/login?reason=${(e.data.reason as string) ?? "expired"}`; }
    }
  }, [videoId, flash]);
  useEffect(() => {
    if (phase !== "ready") return;
    const t = setInterval(() => beat(), 5000);
    const unload = () => { // best-effort final save
      const v = vid.current; if (!v || !stream.current) return;
      navigator.sendBeacon("/api/progress", new Blob([JSON.stringify({ videoId, streamId: stream.current, positionSec: v.currentTime, final: true })], { type: "application/json" }));
    };
    window.addEventListener("pagehide", unload);
    return () => { clearInterval(t); window.removeEventListener("pagehide", unload); };
  }, [phase, beat, videoId]);

  /* ---------- 4. media element events ---------- */
  useEffect(() => {
    const v = vid.current; if (!v) return;
    const on: [string, () => void][] = [
      ["play", () => setPaused(false)], ["pause", () => { setPaused(true); if (phaseRef.current === "ready") beat(); }],
      ["timeupdate", () => setCur(v.currentTime)], ["durationchange", () => setDur(v.duration || 0)],
      ["waiting", () => setBuffering(true)], ["playing", () => setBuffering(false)], ["canplay", () => setBuffering(false)],
      ["volumechange", () => { setVol(v.volume); setMuted(v.muted); }], ["ended", () => beat(true)],
    ];
    on.forEach(([e, f]) => v.addEventListener(e, f));
    return () => on.forEach(([e, f]) => v.removeEventListener(e, f));
  }, [beat]);

  /* ---------- 5. content-protection layer ---------- */
  useEffect(() => {
    const b = box.current, v = vid.current, g = grantRef.current;
    if (!b || !v || !g) return;
    const pause = () => v.pause();
    const stops: (() => void)[] = [];
    const on = <K extends keyof DocumentEventMap>(t: EventTarget, ev: string, fn: (e: never) => void, opts?: boolean | AddEventListenerOptions) => { t.addEventListener(ev, fn as EventListener, opts); stops.push(() => t.removeEventListener(ev, fn as EventListener, opts)); };
    void (null as unknown as keyof DocumentEventMap);

    // watermark (+ tamper escalation)
    let strikes: number[] = [];
    stops.push(installWatermark(b, g.watermark, (why) => {
      report("watermark_tamper", why);
      const now = Date.now(); strikes = [...strikes.filter((t) => now - t < 30_000), now];
      if (strikes.length >= 3) { pause(); setMsg("Playback was paused because the on-screen identification overlay was modified. Reload the page to continue."); setPhase("blocked"); }
    }));

    // no right-click menu, no drag-out, no download/PiP/cast affordances
    on(document, "contextmenu", (e: Event) => { e.preventDefault(); report("contextmenu"); });
    on(document, "dragstart", (e: Event) => e.preventDefault());
    v.disablePictureInPicture = true; v.disableRemotePlayback = true; v.setAttribute("controlsList", "nodownload nofullscreen noremoteplayback");

    // fullscreen: neutralise the API on our elements, bounce out if anything slips through, block dblclick + F11
    const denied = () => Promise.reject(new DOMException("Fullscreen is disabled for protected content", "NotAllowedError"));
    for (const el of [v, b] as HTMLElement[]) { (el as unknown as Record<string, unknown>).requestFullscreen = denied; (el as unknown as Record<string, unknown>).webkitRequestFullscreen = denied; }
    (v as unknown as Record<string, unknown>).webkitEnterFullscreen = denied;
    on(b, "dblclick", (e: Event) => { e.preventDefault(); e.stopPropagation(); });
    const exitFs = () => { if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); pause(); flash("Full screen is disabled"); report("fullscreen_attempt"); } };
    on(document, "fullscreenchange", exitFs); on(document, "webkitfullscreenchange", exitFs); on(v, "webkitbeginfullscreen", exitFs);
    const mq = window.matchMedia("(display-mode: fullscreen)");
    const mqCheck = () => { if (mq.matches) { pause(); setAway("Browser full screen (F11) is not allowed. Press F11 to exit and continue."); report("f11_fullscreen"); } else setAway((a) => (a?.startsWith("Browser full") ? null : a)); };
    mq.addEventListener("change", mqCheck); stops.push(() => mq.removeEventListener("change", mqCheck)); mqCheck();

    // deterrent shortcut blocking (screenshot / devtools / save / print / view-source)
    on(window, "keydown", (e: KeyboardEvent) => {
      if (e.key === "F11" || BLOCKED_KEYS(e)) { e.preventDefault(); e.stopPropagation(); flash("That shortcut is disabled on protected content"); report("blocked_shortcut", e.key); if (e.key === "PrintScreen") pause(); }
    }, true);
    on(window, "keyup", (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") { navigator.clipboard?.writeText("Screenshots are disabled on protected training content.").catch(() => {}); pause(); report("printscreen"); }
    }, true);

    // optional: pause when the tab/window loses focus
    if (g.security.pauseOnBlur) {
      const lost = () => { pause(); setAway("Playback paused because this window lost focus."); report("focus_lost"); };
      on(document, "visibilitychange", () => document.hidden && lost()); on(window, "blur", lost);
    }
    return () => stops.forEach((s) => s());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === "ready" || phase === "loading"]);

  /* ---------- controls ---------- */
  const toggle = () => { const v = vid.current; if (!v) return; if (away) setAway(null); v.paused ? v.play().catch(() => {}) : v.pause(); };
  const seek = (t: number) => { if (vid.current) vid.current.currentTime = t; setCur(t); };
  const pickAudio = (lang: string) => { const i = hls.current?.audioTracks.findIndex((t) => t.lang === lang) ?? -1; if (i >= 0 && hls.current) hls.current.audioTrack = i; }; // in-place switch: no reload, position kept
  const label = (lang: string) => grant?.tracks.find((t) => t.lang === lang)?.label ?? lang.toUpperCase();
  const curLang = audio.find((a) => a.id === audioIdx)?.lang;
  const playing = phase === "ready";

  return (
    <div className="protect-print no-select space-y-3">
      <div ref={box} tabIndex={0} className="relative aspect-video overflow-hidden rounded-xl bg-black shadow-2xl ring-1 ring-white/10 outline-none"
        onKeyDown={(e) => { if (e.code === "Space") { e.preventDefault(); toggle(); } if (e.key === "ArrowRight") seek(Math.min(dur, cur + 5)); if (e.key === "ArrowLeft") seek(Math.max(0, cur - 5)); }}>
        <video ref={vid} className="absolute inset-0 h-full w-full" playsInline disablePictureInPicture disableRemotePlayback onClick={toggle} draggable={false} />

        {(phase === "init" || phase === "loading" || (playing && buffering && !paused)) && <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-white"><Spinner className="h-9 w-9" /></div>}
        {playing && paused && !away && <button onClick={toggle} className="absolute inset-0 z-20 flex items-center justify-center bg-black/25" aria-label="Play"><span className="rounded-full bg-brand p-5 text-white shadow-xl"><Play size={34} fill="currentColor" /></span></button>}

        {phase === "face" && <Overlay icon={<ScanFace size={44} className="text-brand" />} title="Face verification" body="Verifying your identity… (simulated — real facial recognition ships in Version 2)"><Spinner className="mt-3 text-white" /></Overlay>}
        {phase === "error" && <Overlay icon={<AlertTriangle size={44} className="text-brand" />} title="Can't play this video" body={msg}><Button className="mt-4" onClick={() => location.reload()}>Try again</Button></Overlay>}
        {phase === "blocked" && <Overlay icon={<ShieldAlert size={44} className="text-red-400" />} title="Playback paused" body={msg}><Button className="mt-4" onClick={() => location.reload()}>Reload</Button></Overlay>}
        {phase === "conflict" && <Overlay icon={<Smartphone size={44} className="text-brand" />} title="Playing in another window" body="This video was started in another tab or device on your account. Only one stream is allowed at a time."><Button className="mt-4" onClick={() => location.reload()}>Play here instead</Button></Overlay>}
        {away && phase === "ready" && <Overlay icon={<EyeOff size={44} className="text-brand" />} title="Paused" body={away}>{!away.includes("F11") && <Button className="mt-4" onClick={toggle}>Resume</Button>}</Overlay>}
        {justDone && <div className="absolute right-4 top-4 z-40 flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-bold text-white shadow-lg"><CheckCircle2 size={16} /> Completed</div>}
        {toast && <div className="absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-lg bg-black/80 px-4 py-2 text-sm font-medium text-white">{toast}</div>}

        {/* custom control bar: deliberately no download, fullscreen, PiP or cast buttons */}
        {playing && (
          <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/85 to-transparent px-4 pb-3 pt-10 text-white">
            <input type="range" min={0} max={dur || 1} step={0.1} value={cur} onChange={(e) => seek(+e.target.value)} aria-label="Seek" className="h-1.5 w-full cursor-pointer accent-[#ff7a1a]" />
            <div className="mt-2 flex items-center gap-3 text-sm">
              <button onClick={toggle} aria-label={paused ? "Play" : "Pause"} className="rounded p-1 hover:bg-white/15">{paused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}</button>
              <button onClick={() => { if (vid.current) vid.current.muted = !muted; }} aria-label="Mute" className="rounded p-1 hover:bg-white/15">{muted || vol === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>
              <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : vol} onChange={(e) => { if (vid.current) { vid.current.muted = false; vid.current.volume = +e.target.value; } }} aria-label="Volume" className="hidden w-20 accent-[#ff7a1a] sm:block" />
              <span className="tabular-nums text-white/80">{fmtDuration(cur)} / {fmtDuration(dur)}</span>
              <div className="ml-auto flex items-center gap-3">
                {audio.length > 1 && (
                  <div className="flex items-center gap-1 rounded-lg bg-white/10 p-0.5" role="group" aria-label="Audio language">
                    <Languages size={15} className="mx-1.5 text-brand" />
                    {audio.map((a) => <button key={a.id} onClick={() => pickAudio(a.lang)} className={`rounded-md px-2.5 py-1 text-xs font-bold ${curLang === a.lang ? "bg-brand text-white" : "text-white/80 hover:bg-white/15"}`}>{label(a.lang)}</button>)}
                  </div>
                )}
                <select value={rate} onChange={(e) => { const r = +e.target.value; setRate(r); if (vid.current) vid.current.playbackRate = r; }} aria-label="Speed" className="rounded-md bg-white/10 px-1.5 py-1 text-xs font-semibold [&>option]:text-black">
                  {[0.75, 1, 1.25, 1.5].map((r) => <option key={r} value={r}>{r}×</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-navy-800 px-4 py-3 text-sm text-white/80">
        <span className="flex items-center gap-2"><Maximize2 size={14} className="text-white/40" /> Protected stream · encrypted · watermarked{grant?.security.pauseOnBlur ? " · pauses when you leave" : ""}</span>
        <span className="flex items-center gap-3">
          {done ? <span className="flex items-center gap-1.5 font-bold text-emerald-400"><CheckCircle2 size={16} /> Completed</span> : <span>Auto-completes at 90% watched · {Math.min(pct, 100)}%</span>}
          {done && (nextHref ? <Link href={nextHref} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 font-semibold text-white hover:bg-brand-600">{nextLabel} <ArrowRight size={14} /></Link> : <Link href={courseHref} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 font-semibold text-white hover:bg-brand-600">{nextLabel} <ArrowRight size={14} /></Link>)}
        </span>
      </div>
    </div>
  );
}

function Overlay({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-navy-950/90 p-6 text-center text-white">
      {icon}<p className="text-xl font-bold">{title}</p><p className="max-w-md text-sm text-white/70">{body}</p>{children}
    </div>
  );
}
