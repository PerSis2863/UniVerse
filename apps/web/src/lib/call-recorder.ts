'use client';

// Records a class call in the teacher's browser: everyone's video drawn into one picture (a
// grid, or the shared screen large) with everyone's audio mixed in. Kept lean, about 450 MB an
// hour for video calls and 30 MB for voice, so recordings upload quickly and R2 stays small.

export interface RecSource { name: string; stream: MediaStream | null; video: HTMLVideoElement | null; showVideo: boolean; sharing: boolean }

const W = 1280, H = 720, FPS = 15;

function pickType(video: boolean): string | null {
  const options = video
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return options.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export const canRecord = () => typeof window !== 'undefined' && 'MediaRecorder' in window;

export class CallRecorder {
  private ctx = new AudioContext();
  private mix = this.ctx.createMediaStreamDestination();
  private wired = new Map<string, MediaStreamAudioSourceNode>();
  private chunks: Blob[] = [];
  private rec: MediaRecorder;
  private timer: ReturnType<typeof setInterval> | null = null;
  private canvas: HTMLCanvasElement | null = null;
  readonly type: string;
  readonly startedAt = Date.now();

  constructor(private sources: () => RecSource[], video: boolean) {
    const type = pickType(video);
    if (!type) throw new Error('This browser can’t record calls.');
    this.type = type;
    const tracks = [...this.mix.stream.getAudioTracks()];
    if (video) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = W;
      this.canvas.height = H;
      tracks.unshift(...this.canvas.captureStream(FPS).getVideoTracks());
      this.timer = setInterval(() => this.draw(), 1000 / FPS);
    } else {
      this.timer = setInterval(() => this.wire(), 1000);
    }
    this.wire();
    this.rec = new MediaRecorder(new MediaStream(tracks), { mimeType: type, videoBitsPerSecond: 900_000, audioBitsPerSecond: 64_000 });
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start(10_000);
  }

  get bytes() { return this.chunks.reduce((n, c) => n + c.size, 0); }

  /** Adds anyone new to the audio mix (and lets go of people who left). */
  private wire() {
    const live = new Set<string>();
    for (const s of this.sources()) {
      for (const t of s.stream?.getAudioTracks() ?? []) {
        live.add(t.id);
        if (this.wired.has(t.id)) continue;
        try {
          const node = this.ctx.createMediaStreamSource(new MediaStream([t]));
          node.connect(this.mix);
          this.wired.set(t.id, node);
        } catch { /* ended track */ }
      }
    }
    for (const [id, node] of this.wired) if (!live.has(id)) { node.disconnect(); this.wired.delete(id); }
  }

  private frame = 0;
  private draw() {
    if (++this.frame % FPS === 0) this.wire();
    const g = this.canvas?.getContext('2d');
    if (!g) return;
    g.fillStyle = '#0b0e1a';
    g.fillRect(0, 0, W, H);
    const all = this.sources();
    const shared = all.find((s) => s.sharing && s.showVideo && s.video?.videoWidth);
    const tiles = shared ? [shared] : all.slice(0, 16);
    const cols = Math.ceil(Math.sqrt(tiles.length)), rows = Math.ceil(tiles.length / cols);
    const tw = W / cols, th = H / rows, gap = tiles.length > 1 ? 6 : 0;
    tiles.forEach((s, i) => {
      const x = (i % cols) * tw + gap / 2, y = Math.floor(i / cols) * th + gap / 2, w = tw - gap, h = th - gap;
      const v = s.video;
      if (s.showVideo && v && v.videoWidth) {
        // Fit inside the tile (a shared screen must not be cropped).
        const scale = Math.min(w / v.videoWidth, h / v.videoHeight);
        const dw = v.videoWidth * scale, dh = v.videoHeight * scale;
        g.fillStyle = '#000';
        g.fillRect(x, y, w, h);
        g.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      } else {
        g.fillStyle = '#18181b';
        g.fillRect(x, y, w, h);
        g.fillStyle = '#6366f1';
        g.beginPath();
        g.arc(x + w / 2, y + h / 2, Math.min(w, h) / 6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff';
        g.font = `bold ${Math.round(Math.min(w, h) / 8)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(s.name.split(/\s+/).map((n) => n[0]).join('').slice(0, 2).toUpperCase(), x + w / 2, y + h / 2);
      }
      g.font = '600 18px system-ui, sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      const label = shared ? `${s.name} is presenting` : s.name;
      const lw = g.measureText(label).width + 20;
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(x + 10, y + h - 38, lw, 28);
      g.fillStyle = '#fff';
      g.fillText(label, x + 20, y + h - 18);
    });
  }

  /** Stops and returns the recording. */
  stop(): Promise<{ blob: Blob; durationSec: number }> {
    return new Promise((resolve) => {
      const durationSec = Math.round((Date.now() - this.startedAt) / 1000);
      this.rec.onstop = () => {
        if (this.timer) clearInterval(this.timer);
        for (const node of this.wired.values()) node.disconnect();
        if (this.ctx.state !== 'closed') void this.ctx.close().catch(() => {});
        resolve({ blob: new Blob(this.chunks, { type: this.type.split(';')[0] }), durationSec });
      };
      if (this.rec.state === 'inactive') this.rec.onstop(new Event('stop'));
      else this.rec.stop();
    });
  }
}

/** Uploads a finished recording to the class's materials, reporting progress (0–1). */
export async function uploadRecording(callId: string, blob: Blob, durationSec: number, authed: <T>(url: string, init?: RequestInit) => Promise<T>, onProgress: (p: number) => void) {
  const contentType = blob.type || 'video/webm';
  const { uploadUrl, url } = await authed<{ uploadUrl: string; url: string }>(`/api/calls/${callId}/recording`, { method: 'POST', body: JSON.stringify({ step: 'upload', contentType, size: blob.size }) });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Upload failed. Check the connection.'));
    xhr.send(blob);
  });
  return authed<{ id: string; title: string }>(`/api/calls/${callId}/recording`, { method: 'POST', body: JSON.stringify({ step: 'save', url, size: blob.size, durationSec }) });
}
