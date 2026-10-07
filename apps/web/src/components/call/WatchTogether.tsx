'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Clapperboard, Link2, ListVideo, Loader2, Lock, LockOpen, MessageSquareText, Pause, Play, Send, Square, Users, Volume2, VolumeX, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { haptic } from '@/lib/haptics';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { FilePlayer, YouTubePlayer, youTubeEmbed, youTubeId, youTubeThumb, type Player, type WatchSrc } from '@/lib/youtube-player';

// Watch together in a call (Stage 4 · 4.8). The call room (cloudflare/worker.ts, "Watch together")
// keeps one video and where it is; every browser plays it itself and follows the room's clock.
// WatchStage is the video on the call's main stage, with the controls: whoever may control it plays,
// pauses and seeks for everyone ("Pause for everyone"); anyone else can pause or skip just for
// themselves and come back to everyone. Reactions and comments sit on the timeline and show up
// when the video reaches them. WatchPicker starts one: a YouTube link, or a video of the course.

export interface WatchMark { id: string; t: number; emoji?: string; text?: string; name: string; uid: string }
export interface WatchState { id: string; src: WatchSrc; playing: boolean; pos: number; at: number; by: string; byName: string; lock: boolean; mine: boolean; marks: WatchMark[] }

const clock = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};
/** How far apart a player may drift before it jumps back in step (YouTube reports its time less often). */
const TOLERANCE = { youtube: 1.2, file: 0.6 };
const SEEK_REST_MS = 1500;
/** Comments show for this long once the video reaches them. */
const NOTE_SHOW_S = 5;

export function WatchStage({ watch, skew, mod, status, held = false, onSend }: {
  watch: WatchState;
  /** The call room's clock minus this device's (ms), updated with every message. */
  skew: React.RefObject<number>;
  /** Host or co-host: always controls it. */
  mod: boolean;
  /** Who last did what ("Ms Teacher paused"). */
  status: string | null;
  /** The call is on hold (another call is active): the video keeps its place, silently. */
  held?: boolean;
  onSend: (msg: Record<string, unknown>) => void;
}) {
  const owner = mod || watch.mine;
  const ctl = owner || !watch.lock;
  const frame = useRef<HTMLIFrameElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const player = useRef<Player | null>(null);
  const live = useRef(watch);
  const own = useRef(false);
  const lastSeek = useRef(0);
  const askedPlay = useRef(0);
  const [view, setView] = useState({ t: 0, d: 0, playing: false, ready: false });
  const [ownMode, setOwnMode] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [vol, setVol] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [note, setNote] = useState('');
  const [ytTitle, setYtTitle] = useState('');

  useEffect(() => { live.current = watch; }, [watch]);

  // Where everyone is now, by the room's clock (negative: about to start).
  const expected = () => {
    const w = live.current;
    return w.pos + (w.playing ? (Date.now() + (skew.current ?? 0) - w.at) / 1000 : 0);
  };

  // The player for this video, and the loop that keeps it in step with everyone.
  const srcKey = watch.src.kind === 'youtube' ? `yt:${watch.src.id}` : `file:${watch.src.url}`;
  useEffect(() => {
    const changed = () => {
      const p = player.current;
      if (!p) return;
      if (p instanceof YouTubePlayer) {
        if (p.title) setYtTitle(p.title);
        if (p.error !== null) setFailed(p.error === 101 || p.error === 150 ? 'This video can’t be played inside other apps. Try another one.' : 'This video can’t be played.');
      }
      if (p.playing()) setBlocked(false);
    };
    const p: Player | null = watch.src.kind === 'youtube'
      ? frame.current && new YouTubePlayer(frame.current, changed)
      : video.current && new FilePlayer(video.current, changed);
    player.current = p;
    const kind = watch.src.kind;
    const step = () => {
      const pl = player.current;
      if (!pl) return;
      const w = live.current;
      const e = expected();
      const d = pl.duration();
      setView({ t: pl.time(), d, playing: pl.playing(), ready: pl.ready });
      if (!pl.ready || own.current) return;
      if (e < 0) {
        // About to start: everyone waits at the beginning.
        if (pl.playing()) pl.pause();
        setCountdown(Math.ceil(-e));
        return;
      }
      setCountdown(null);
      const target = d ? Math.min(e, d) : e;
      const atEnd = !!d && e >= d - 0.3;
      if (w.playing && !atEnd && !pl.playing()) {
        if (!askedPlay.current) askedPlay.current = Date.now();
        pl.play();
        // Still not playing after a few seconds: the browser wants a tap first.
        if (Date.now() - askedPlay.current > 3000) setBlocked(true);
      } else askedPlay.current = 0;
      if (!w.playing && pl.playing()) pl.pause();
      const drift = pl.time() - target;
      if (Math.abs(drift) > TOLERANCE[kind] && Date.now() - lastSeek.current > SEEK_REST_MS) {
        lastSeek.current = Date.now();
        pl.seek(target);
      } else if (w.playing) pl.rate(Math.abs(drift) > 0.15 ? (drift > 0 ? 0.96 : 1.04) : 1);
    };
    const loop = setInterval(step, 250);
    return () => { clearInterval(loop); p?.destroy(); player.current = null; };
  }, [srcKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { player.current?.volume(vol, muted || held); }, [vol, muted, held, view.ready]);

  const backToEveryone = () => { own.current = false; setOwnMode(false); lastSeek.current = 0; };
  const goOwn = () => { own.current = true; setOwnMode(true); };
  const toggle = () => {
    haptic('tap');
    const p = player.current;
    if (!p) return;
    const playingNow = own.current ? p.playing() : watch.playing;
    if (ctl && !own.current) onSend({ type: 'watch', op: playingNow ? 'pause' : 'play', t: p.time() });
    else {
      // Just for me: pause or carry on where I am.
      goOwn();
      if (playingNow) p.pause(); else p.play();
    }
  };
  const seekTo = (t: number) => {
    const p = player.current;
    if (!p) return;
    if (ctl && !own.current) onSend({ type: 'watch', op: 'seek', t });
    else { goOwn(); p.seek(t); }
  };
  const commitScrub = () => { if (scrub !== null) seekTo(scrub); setScrub(null); };
  const sendNote = () => {
    const text = note.trim();
    if (!text) return;
    haptic('tap');
    onSend({ type: 'watch', op: 'note', text });
    setNote('');
  };

  const dur = view.d;
  const shown = scrub ?? view.t;
  const notes = watch.marks.filter((m) => m.text);
  // Comments whose moment the video is at now.
  const current = notes.filter((m) => view.t >= m.t && view.t - m.t < NOTE_SHOW_S).slice(-3);
  const marks = dur ? watch.marks.slice(-150) : [];
  const title = watch.src.kind === 'file' ? watch.src.title : ytTitle || 'YouTube video';
  const isPlaying = ownMode ? view.playing : watch.playing;

  return (
    <div className="absolute inset-0 flex flex-col bg-black">
      <div className="relative flex-1 min-h-0">
        {watch.src.kind === 'youtube' ? (
          <iframe ref={frame} key={srcKey} src={typeof window === 'undefined' ? undefined : youTubeEmbed(watch.src.id)} title={title} allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin" className="absolute inset-0 w-full h-full border-0" />
        ) : (
          <video ref={video} key={srcKey} src={watch.src.url} playsInline preload="auto" className="absolute inset-0 w-full h-full object-contain" aria-label={title} />
        )}
        {/* Taps on the video play or pause through our controls (YouTube's own are hidden), unless the browser wants a tap on the video itself first. */}
        {!blocked && !failed && <button type="button" onClick={toggle} className="absolute inset-0 w-full h-full cursor-pointer" aria-label={isPlaying ? (ctl && !ownMode ? 'Pause for everyone' : 'Pause') : (ctl && !ownMode ? 'Play for everyone' : 'Play')} />}

        <div className="absolute inset-x-0 top-3 flex flex-col items-center gap-2 pointer-events-none px-3">
          <AnimatePresence>
            {ownMode && (
              <motion.div key="own" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring.smooth}
                className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-black/70 backdrop-blur-xl border border-white/10 pl-3.5 pr-1.5 py-1.5 text-xs font-semibold">
                You’re watching on your own
                <button type="button" onClick={backToEveryone} className="h-7 px-3 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 font-bold inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />Back to everyone</button>
              </motion.div>
            )}
            {blocked && !failed && (
              <motion.p key="tap" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-full bg-black/70 backdrop-blur-xl border border-white/10 px-3.5 py-1.5 text-xs font-semibold">
                Tap the video to start it
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {countdown !== null && !ownMode && (
            <motion.div key="count" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={spring.smooth}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 pointer-events-none" role="status">
              <p className="text-sm text-zinc-300">Starting for everyone in</p>
              <motion.p key={countdown} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.snappy} className="text-6xl font-bold tabular-nums">{countdown}</motion.p>
            </motion.div>
          )}
          {failed && (
            <motion.div key="failed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center">
              <Clapperboard className="w-10 h-10 text-zinc-500" />
              <p className="text-sm text-zinc-300 max-w-xs">{failed}</p>
              {owner && <button type="button" onClick={() => onSend({ type: 'watch', op: 'stop' })} className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm font-semibold">Stop the video</button>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Comments at their moment in the video */}
        <div className="absolute left-3 bottom-3 max-w-[70%] flex flex-col items-start gap-1.5 pointer-events-none" aria-live="polite">
          <AnimatePresence initial={false}>
            {current.map((m) => (
              <motion.p key={m.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={spring.smooth}
                className="rounded-2xl bg-black/70 backdrop-blur-md px-3 py-1.5 text-sm shadow-lg">
                <span className="font-semibold text-fuchsia-300 mr-1.5">{m.name}</span>{m.text}
              </motion.p>
            ))}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {listOpen && (
            <motion.aside key="list" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={spring.smooth}
              className="absolute top-3 right-3 bottom-3 w-64 max-w-[80%] rounded-2xl bg-[#121830]/95 backdrop-blur-xl border border-white/10 p-3 flex flex-col gap-2" aria-label="Comments on the video">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Comments · {notes.length}</p>
                <button type="button" onClick={() => setListOpen(false)} aria-label="Close" className="p-1 rounded-full hover:bg-white/10"><X className="w-4 h-4" /></button>
              </div>
              <ul className="flex-1 overflow-y-auto space-y-1">
                {notes.length === 0 && <li className="text-xs text-zinc-400">Comments people write while watching show up here, at their moment in the video.</li>}
                {[...notes].sort((a, b) => a.t - b.t).map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => seekTo(m.t)} className="w-full text-left rounded-xl px-2 py-1.5 hover:bg-white/[0.06] text-xs">
                      <span className="font-mono text-fuchsia-300 mr-1.5">{clock(m.t)}</span><span className="font-semibold">{m.name}</span>
                      <span className="block text-zinc-300">{m.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="shrink-0 px-3 pt-2 pb-2.5 bg-gradient-to-t from-black via-black/90 to-black/60 space-y-1.5">
        <div className="relative h-5">
          {/* Reactions and comments on the timeline */}
          <div className="absolute inset-x-0 top-0 h-3 pointer-events-none" aria-hidden>
            {marks.map((m) => (
              <span key={m.id} className="absolute -translate-x-1/2 text-[10px] leading-none" style={{ left: `${Math.min(100, (m.t / dur) * 100)}%` }}>
                {m.emoji ?? <span className="block w-1.5 h-1.5 mt-0.5 rounded-full bg-fuchsia-400" />}
              </span>
            ))}
          </div>
          <input type="range" min={0} max={dur || 1} step={0.1} value={Math.min(shown, dur || 1)} disabled={!dur}
            onChange={(e) => setScrub(Number(e.target.value))} onPointerUp={commitScrub} onKeyUp={commitScrub} onBlur={() => setScrub(null)}
            aria-label={ctl ? 'Move the video for everyone' : 'Move the video (just for you)'} aria-valuetext={`${clock(shown)} of ${clock(dur)}`}
            className="absolute inset-x-0 bottom-0 w-full h-1.5 accent-fuchsia-500 cursor-pointer disabled:cursor-default" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={toggle} disabled={!view.ready || !!failed}
            className="w-10 h-10 rounded-full bg-white text-zinc-900 flex items-center justify-center disabled:opacity-40"
            aria-label={isPlaying ? (ctl && !ownMode ? 'Pause for everyone' : 'Pause just for me') : (ctl && !ownMode ? 'Play for everyone' : 'Play just for me')}>
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </motion.button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate">{title}</p>
            <p className="text-[11px] text-zinc-400 truncate tabular-nums">
              {clock(shown)} / {clock(dur)}
              {' · '}{!ctl ? `${watch.byName} controls it for everyone` : status ?? (watch.lock ? 'Only you and the hosts control it' : 'Everyone can control it')}
            </p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); sendNote(); }} className="hidden sm:flex items-center gap-1 h-9 rounded-full bg-white/10 pl-3 pr-1 w-56">
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={`Comment at ${clock(view.t)}…`} aria-label="Comment on this moment"
              className="flex-1 min-w-0 bg-transparent outline-none text-xs placeholder:text-zinc-400" />
            <button type="submit" disabled={!note.trim()} aria-label="Send comment" className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 disabled:opacity-40"><Send className="w-3.5 h-3.5" /></button>
          </form>
          <button type="button" onClick={() => setListOpen((v) => !v)} aria-pressed={listOpen} aria-label="Comments" className={cn('w-9 h-9 rounded-full flex items-center justify-center', listOpen ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/20')}>
            <MessageSquareText className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setMuted((v) => !v)} aria-label={muted ? 'Unmute the video' : 'Mute the video'} className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20">
              {muted || vol === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : vol} onChange={(e) => { setVol(Number(e.target.value)); setMuted(false); }} aria-label="Video volume (just for you)" className="hidden md:block w-20 accent-white" />
          </div>
          {owner && (
            <>
              <button type="button" onClick={() => onSend({ type: 'watch', op: 'lock', on: !watch.lock })} aria-pressed={watch.lock}
                aria-label={watch.lock ? 'Let everyone control the video' : 'Only you and the hosts control the video'} title={watch.lock ? 'Only you and the hosts control it' : 'Everyone can control it'}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20">
                {watch.lock ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
              </button>
              <button type="button" onClick={() => onSend({ type: 'watch', op: 'stop' })} aria-label="Stop the video for everyone" className="h-9 px-3 rounded-full bg-rose-600/90 hover:bg-rose-500 text-xs font-semibold inline-flex items-center gap-1">
                <Square className="w-3.5 h-3.5" />Stop
              </button>
            </>
          )}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); sendNote(); }} className="sm:hidden flex items-center gap-1 h-9 rounded-full bg-white/10 pl-3 pr-1">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={`Comment at ${clock(view.t)}…`} aria-label="Comment on this moment"
            className="flex-1 min-w-0 bg-transparent outline-none text-xs placeholder:text-zinc-400" />
          <button type="submit" disabled={!note.trim()} aria-label="Send comment" className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 disabled:opacity-40"><Send className="w-3.5 h-3.5" /></button>
        </form>
      </div>
    </div>
  );
}

const sheet = 'pointer-events-auto w-full max-w-md max-h-[72vh] overflow-y-auto rounded-3xl bg-[#121830]/95 backdrop-blur-2xl border border-white/10 shadow-2xl p-4 space-y-4';

interface CourseVideo { id: string; title: string; url: string; createdAt: string }

/** Starts watching together: a YouTube link, or (class calls) one of the course's videos. */
export function WatchPicker({ open, callId, onClose, onStart }: { open: boolean; callId: string; onClose: () => void; onStart: (src: WatchSrc) => void }) {
  const [link, setLink] = useState('');
  const [videos, setVideos] = useState<CourseVideo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const id = youTubeId(link);
  const classCall = /^c_/.test(callId);

  const load = async () => {
    setLoading(true);
    try { setVideos((await authedJson<{ videos: CourseVideo[] }>(`/api/calls/${encodeURIComponent(callId)}/videos`)).videos); } catch { setVideos([]); } finally { setLoading(false); }
  };
  const start = (src: WatchSrc) => { haptic('tap'); onStart(src); setLink(''); onClose(); };
  const fromMaterial = (v: CourseVideo) => {
    const yt = youTubeId(v.url);
    if (yt) return start({ kind: 'youtube', id: yt });
    if (!/^\/api\/files\//.test(v.url) && !/^https:\/\//.test(v.url)) { toast.error('This video can’t be played here.'); return; }
    start({ kind: 'file', url: v.url, title: v.title });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="watch-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 z-30 bg-black/40" aria-hidden />
          <div key="watch-pick" className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] z-40 px-3 flex justify-center pointer-events-none">
            <motion.div role="dialog" aria-label="Watch together" initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.97 }} transition={spring.smooth} className={sheet}>
              <div className="flex items-center justify-between">
                <p className="font-semibold inline-flex items-center gap-2"><ListVideo className="w-4 h-4 text-fuchsia-300" />Watch together</p>
                <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-sm text-zinc-400">Everyone in the call sees it at the same moment, with reactions and comments on its timeline.</p>
              <form onSubmit={(e) => { e.preventDefault(); if (id) start({ kind: 'youtube', id }); }} className="space-y-2">
                <label className="flex items-center gap-2 rounded-2xl bg-white/10 px-3 h-11 focus-within:ring-2 focus-within:ring-fuchsia-400/50">
                  <Link2 className="w-4 h-4 text-zinc-400 shrink-0" />
                  <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a YouTube link" aria-label="YouTube link" inputMode="url" autoFocus
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-zinc-500" />
                </label>
                <AnimatePresence initial={false}>
                  {id && (
                    <motion.div key={id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring.smooth} className="overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={youTubeThumb(id)} alt="" className="w-full aspect-video object-cover rounded-2xl bg-white/5" />
                    </motion.div>
                  )}
                </AnimatePresence>
                {link.trim() && !id && <p className="text-xs text-amber-300">That doesn’t look like a YouTube link.</p>}
                <button type="submit" disabled={!id} className="w-full h-11 rounded-2xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-40">
                  <Play className="w-4 h-4" />Play for everyone
                </button>
              </form>
              {classCall && (
                videos === null ? (
                  <button type="button" onClick={() => void load()} disabled={loading} className="w-full flex items-center gap-2 rounded-2xl px-3 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] text-sm font-medium">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clapperboard className="w-4 h-4 text-indigo-200" />}A video from this course
                  </button>
                ) : videos.length === 0 ? (
                  <p className="text-xs text-zinc-400">This course has no videos yet. Videos added to its materials (and class recordings) show up here.</p>
                ) : (
                  <ul className="space-y-1" aria-label="Course videos">
                    {videos.map((v) => (
                      <li key={v.id}>
                        <button type="button" onClick={() => fromMaterial(v)} className="w-full flex items-center gap-2.5 rounded-2xl px-3 py-2 hover:bg-white/[0.06] text-left">
                          <span className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0"><Clapperboard className="w-4 h-4 text-indigo-200" /></span>
                          <span className="min-w-0 text-sm font-medium truncate">{v.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
