'use client';

// Players for watching a video together in a call (Stage 4 · 4.8; src/components/call/WatchTogether.tsx).
// YouTube plays in its privacy-enhanced player (youtube-nocookie.com) and is driven through the
// embed's message channel, the same one YouTube's own IFrame API uses, so no YouTube script runs in
// the app (the Content-Security-Policy only allows the frame). Course videos play in a <video>.

export type WatchSrc = { kind: 'youtube'; id: string } | { kind: 'file'; url: string; title: string };

const YT_ORIGIN = 'https://www.youtube-nocookie.com';
const ID = /^[A-Za-z0-9_-]{11}$/;

/** The video id in a YouTube link (watch, youtu.be, shorts, live, embed), or the id itself. */
export function youTubeId(input: string): string | null {
  const s = input.trim();
  if (ID.test(s)) return s;
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`);
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    const id = host === 'youtu.be' ? u.pathname.slice(1, 12)
      : host === 'youtube.com' || host === 'youtube-nocookie.com' ? u.searchParams.get('v') ?? /^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/.exec(u.pathname)?.[1] ?? ''
      : '';
    return ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

export const youTubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

export const youTubeEmbed = (id: string) =>
  `${YT_ORIGIN}/embed/${id}?enablejsapi=1&controls=0&disablekb=1&rel=0&playsinline=1&iv_load_policy=3&fs=0&origin=${encodeURIComponent(location.origin)}`;

/** What WatchStage needs from a player. */
export interface Player {
  ready: boolean;
  time(): number;
  duration(): number;
  playing(): boolean;
  play(): void;
  pause(): void;
  seek(t: number): void;
  /** A little faster or slower to catch up smoothly (course videos only). */
  rate(r: number): void;
  volume(v: number, muted: boolean): void;
  destroy(): void;
}

/** A YouTube embed, driven by messages. `onChange` runs when its state or time changes. */
export class YouTubePlayer implements Player {
  ready = false;
  title = '';
  error: number | null = null;
  private t = 0;
  private tAt = 0;
  private len = 0;
  private state = -1;
  private hello: ReturnType<typeof setInterval>;

  constructor(private frame: HTMLIFrameElement, private onChange: () => void) {
    window.addEventListener('message', this.onMessage);
    // Say hello until the player answers (it may still be loading); it then reports its state.
    this.hello = setInterval(() => { if (!this.ready) this.post({ event: 'listening' }); }, 300);
  }

  private post(msg: Record<string, unknown>) {
    try { this.frame.contentWindow?.postMessage(JSON.stringify({ ...msg, id: 1, channel: 'widget' }), YT_ORIGIN); } catch { /* frame gone */ }
  }

  private command(func: string, args: unknown[] = []) { this.post({ event: 'command', func, args }); }

  private onMessage = (e: MessageEvent) => {
    if (e.origin !== YT_ORIGIN || e.source !== this.frame.contentWindow) return;
    let d: { event?: string; info?: Record<string, unknown> | number | null } | null = null;
    try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
    if (!d?.event) return;
    if (!this.ready && (d.event === 'onReady' || d.event === 'initialDelivery' || d.event === 'infoDelivery')) {
      this.ready = true;
      clearInterval(this.hello);
      this.command('addEventListener', ['onStateChange']);
      this.command('addEventListener', ['onError']);
    }
    if (d.event === 'onError') this.error = typeof d.info === 'number' ? d.info : 1;
    if (d.event === 'onStateChange' && typeof d.info === 'number') this.state = d.info;
    if ((d.event === 'infoDelivery' || d.event === 'initialDelivery') && d.info && typeof d.info === 'object') {
      const i = d.info as { currentTime?: unknown; duration?: unknown; playerState?: unknown; videoData?: { title?: unknown } };
      if (typeof i.currentTime === 'number') { this.t = i.currentTime; this.tAt = performance.now(); }
      if (typeof i.duration === 'number' && i.duration > 0) this.len = i.duration;
      if (typeof i.playerState === 'number') this.state = i.playerState;
      if (typeof i.videoData?.title === 'string' && i.videoData.title) this.title = i.videoData.title;
    }
    this.onChange();
  };

  // YouTube reports the time now and then: in between it's counted on while playing.
  time() { return this.state === 1 ? this.t + (performance.now() - this.tAt) / 1000 : this.t; }
  duration() { return this.len; }
  playing() { return this.state === 1 || this.state === 3; }
  play() { this.command('playVideo'); }
  pause() { this.command('pauseVideo'); }
  seek(t: number) { this.t = t; this.tAt = performance.now(); this.command('seekTo', [t, true]); }
  rate() { /* YouTube only plays at set speeds: it catches up by seeking */ }
  volume(v: number, muted: boolean) { this.command('setVolume', [Math.round(v * 100)]); this.command(muted ? 'mute' : 'unMute'); }
  destroy() { clearInterval(this.hello); window.removeEventListener('message', this.onMessage); }
}

/** A course video in a <video> element. */
export class FilePlayer implements Player {
  ready = false;
  blocked = false;
  constructor(private v: HTMLVideoElement, private onChange: () => void) {
    for (const ev of ['loadedmetadata', 'play', 'pause', 'seeked', 'waiting', 'playing', 'ended', 'error']) v.addEventListener(ev, this.update);
    if (v.readyState >= 1) this.ready = true;
  }
  private update = () => { this.ready = this.v.readyState >= 1; this.onChange(); };
  time() { return this.v.currentTime; }
  duration() { return Number.isFinite(this.v.duration) ? this.v.duration : 0; }
  playing() { return !this.v.paused && !this.v.ended; }
  play() { void this.v.play().then(() => { this.blocked = false; }).catch((e: Error) => { if (e.name === 'NotAllowedError') { this.blocked = true; this.onChange(); } }); }
  pause() { this.v.pause(); }
  seek(t: number) { this.v.currentTime = t; }
  rate(r: number) { if (Math.abs(this.v.playbackRate - r) > 0.001) this.v.playbackRate = r; }
  volume(v: number, muted: boolean) { this.v.volume = v; this.v.muted = muted; }
  destroy() { for (const ev of ['loadedmetadata', 'play', 'pause', 'seeked', 'waiting', 'playing', 'ended', 'error']) this.v.removeEventListener(ev, this.update); }
}
