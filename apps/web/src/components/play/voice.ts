'use client';

// Voice in UniVerse Play rooms (M39): proximity voice, like the big online games. Each player who
// turns it on gets a direct audio link (WebRTC) to every other player who has it on; the room only
// passes the handshakes on (cloudflare/game-room.ts, 13+ only). Each voice plays through a 3D
// panner placed where that player's character stands, so near players are loud and to the side
// you hear them from that side; far ones fade out. Nothing is recorded or kept.

type Send = (m: Record<string, unknown>) => void;
interface Link { pc: RTCPeerConnection; panner?: PannerNode; analyser?: AnalyserNode; el?: HTMLAudioElement; pending: RTCIceCandidateInit[]; level: number }
const LEVEL = new Uint8Array(64);

export class RoomVoice {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private links = new Map<string, Link>();
  private myLevel: AnalyserNode | null = null;
  muted = false;

  constructor(private send: Send, private ice: RTCIceServer[], private me: () => string | null) {}

  get on() { return !!this.stream; }

  /** Asks for the microphone and tells the room this player can be heard. */
  async start() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    void this.ctx.resume();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.myLevel = this.ctx.createAnalyser(); this.myLevel.fftSize = 128;
    src.connect(this.myLevel);
    this.send({ t: 'voice', on: true });
  }

  stop() {
    if (!this.stream) return;
    this.send({ t: 'voice', on: false });
    for (const id of [...this.links.keys()]) this.drop(id);
    this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close();
    this.ctx = null; this.myLevel = null;
  }

  /** Mutes or unmutes this player's microphone (the links stay up). */
  mute(on: boolean) {
    this.muted = on;
    this.stream?.getAudioTracks().forEach((t) => { t.enabled = !on; });
  }

  /** Someone turned voice on or off. The lower id starts each link, so there's one per pair. */
  onVoice(m: { id: string; on: boolean; reply?: boolean }) {
    if (!this.stream) return;
    if (!m.on) { this.drop(m.id); return; }
    if (!m.reply) this.send({ t: 'voice', on: true, to: m.id });
    const me = this.me();
    if (me && me < m.id && !this.links.has(m.id)) void this.call(m.id);
  }

  async onRtc(m: { from: string; sdp?: RTCSessionDescriptionInit | null; ice?: RTCIceCandidateInit | null }) {
    if (!this.stream) return;
    let link = this.links.get(m.from);
    if (!link && m.sdp?.type === 'offer') link = this.link(m.from);
    if (!link) return;
    try {
      if (m.sdp) {
        await link.pc.setRemoteDescription(m.sdp);
        for (const c of link.pending.splice(0)) await link.pc.addIceCandidate(c).catch(() => {});
        if (m.sdp.type === 'offer') {
          await link.pc.setLocalDescription(await link.pc.createAnswer());
          this.send({ t: 'rtc', to: m.from, sdp: link.pc.localDescription?.toJSON() });
        }
      }
      if (m.ice) {
        if (link.pc.remoteDescription) await link.pc.addIceCandidate(m.ice).catch(() => {});
        else link.pending.push(m.ice);
      }
    } catch { this.drop(m.from); }
  }

  /** Puts the listener at the camera and each voice where its player stands (each frame). */
  place(ear: { x: number; y: number; z: number; fx: number; fy: number; fz: number }, where: (id: string) => { x: number; y: number; z: number } | null) {
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener, t = ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(ear.x, t, 0.05); l.positionY.setTargetAtTime(ear.y, t, 0.05); l.positionZ.setTargetAtTime(ear.z, t, 0.05);
      l.forwardX.setTargetAtTime(ear.fx, t, 0.05); l.forwardY.setTargetAtTime(ear.fy, t, 0.05); l.forwardZ.setTargetAtTime(ear.fz, t, 0.05);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(ear.x, ear.y, ear.z); l.setOrientation(ear.fx, ear.fy, ear.fz, 0, 1, 0);
    }
    for (const [id, link] of this.links) {
      const p = where(id);
      if (!p || !link.panner) continue;
      link.panner.positionX.setTargetAtTime(p.x, t, 0.05); link.panner.positionY.setTargetAtTime(p.y + 1.6, t, 0.05); link.panner.positionZ.setTargetAtTime(p.z, t, 0.05);
    }
  }

  /** Who is talking right now (a smoothed level over 0.12), and whether I am. */
  talking(): { me: boolean; ids: Set<string> } {
    const ids = new Set<string>();
    for (const [id, link] of this.links) {
      if (!link.analyser) continue;
      link.level = link.level * 0.7 + level(link.analyser) * 0.3;
      if (link.level > 0.12) ids.add(id);
    }
    return { me: !this.muted && !!this.myLevel && level(this.myLevel) > 0.12, ids };
  }

  private link(id: string): Link {
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const link: Link = { pc, pending: [], level: 0 };
    this.links.set(id, link);
    this.stream?.getTracks().forEach((t) => pc.addTrack(t, this.stream!));
    pc.onicecandidate = (e) => { if (e.candidate) this.send({ t: 'rtc', to: id, ice: e.candidate.toJSON() }); };
    pc.ontrack = (e) => {
      const ctx = this.ctx;
      if (!ctx || link.panner) return;
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      // Chrome only feeds a remote stream into Web Audio once an element plays it (muted).
      link.el = new Audio(); link.el.srcObject = stream; link.el.muted = true; void link.el.play().catch(() => {});
      const src = ctx.createMediaStreamSource(stream);
      link.panner = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 3, maxDistance: 60, rolloffFactor: 1.3 });
      link.analyser = ctx.createAnalyser(); link.analyser.fftSize = 128;
      src.connect(link.analyser);
      src.connect(link.panner).connect(ctx.destination);
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.drop(id); };
    return link;
  }

  private async call(id: string) {
    const link = this.link(id);
    await link.pc.setLocalDescription(await link.pc.createOffer());
    this.send({ t: 'rtc', to: id, sdp: link.pc.localDescription?.toJSON() });
  }

  private drop(id: string) {
    const link = this.links.get(id);
    if (!link) return;
    link.pc.close();
    link.panner?.disconnect();
    if (link.el) { link.el.srcObject = null; }
    this.links.delete(id);
  }
}

/** How loud an analyser hears it, 0–1. */
function level(a: AnalyserNode) {
  a.getByteTimeDomainData(LEVEL);
  let peak = 0;
  for (const v of LEVEL) peak = Math.max(peak, Math.abs(v - 128));
  return peak / 128;
}
