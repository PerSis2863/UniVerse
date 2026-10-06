'use client';

// Bigger calls (src/server/calls.ts): one connection to Cloudflare's SFU instead of one per
// person. You send your microphone and camera once; the SFU forwards them to whoever pulls
// them. Each step goes through the call's room (cloudflare/worker.ts CallRoom → sfuOp), which
// holds the app secret. Steps run one at a time: the SFU wants each offer and answer finished
// before the next change.

export interface SfuTrack { trackName: string; kind: 'audio' | 'video' }
type Rpc = (op: string, body?: Record<string, unknown>) => Promise<Record<string, unknown>>;
interface Desc { type: RTCSdpType; sdp: string }

/**
 * Simulcast: the camera is sent once in three sizes, and each viewer receives the one that suits
 * its tile and connection (a: 720p, b: 360p, c: 180p). The encoder drops the top layers by itself
 * when the sender's upload is weak, and the SFU then falls back to the next one down.
 */
export type Layer = 'a' | 'b' | 'c';
const CAMERA_LAYERS: RTCRtpEncodingParameters[] = [
  { rid: 'a', maxBitrate: 1_000_000, maxFramerate: 30 },
  { rid: 'b', scaleResolutionDownBy: 2, maxBitrate: 320_000, maxFramerate: 30 },
  { rid: 'c', scaleResolutionDownBy: 4, maxBitrate: 110_000, maxFramerate: 15 },
];
const SCREEN_BITRATE = 2_500_000;

/** What a track is: a microphone, a camera, or a shared screen (sent beside the camera). */
export type MediaKind = 'audio' | 'video' | 'screen';
/** Screens are published as "<peer>-screen" (a video track of their own). */
export const kindOf = (t: SfuTrack): MediaKind => (t.kind === 'video' && t.trackName.endsWith('-screen') ? 'screen' : t.kind);

export interface PullItem { peerId: string; sessionId: string; track: SfuTrack; layer?: Layer }

export class SfuLink {
  readonly pc: RTCPeerConnection;
  private queue: Promise<unknown> = Promise.resolve();
  /** mid → whose track it is. */
  private byMid = new Map<string, { peerId: string; kind: MediaKind }>();
  /** trackName → mid, for tracks pulled now. */
  private pulled = new Map<string, string>();
  /** trackName → the camera layer asked for. */
  private layers = new Map<string, Layer>();
  private senders: Partial<Record<MediaKind, RTCRtpSender>> = {};
  private closed = false;

  constructor(
    private rpc: Rpc,
    iceServers: RTCIceServer[],
    private onTrack: (peerId: string, kind: MediaKind, track: MediaStreamTrack) => void,
  ) {
    this.pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' });
    this.pc.ontrack = (e) => {
      const who = e.transceiver.mid ? this.byMid.get(e.transceiver.mid) : undefined;
      if (who) this.onTrack(who.peerId, who.kind, e.track);
    };
  }

  private run<T>(step: () => Promise<T>): Promise<T> {
    const next = this.queue.then(step, step);
    this.queue = next.catch(() => {});
    return next;
  }

  /** Answers an offer from the SFU (after pulling or closing tracks), if it sent one. */
  private async settle(out: Record<string, unknown>) {
    const desc = out.sessionDescription as Desc | undefined;
    if (!out.requiresImmediateRenegotiation || desc?.type !== 'offer') return;
    await this.pc.setRemoteDescription(desc);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this.rpc('renegotiate', { sdp: answer.sdp });
  }

  /** Opens the session without sending anything: a webinar's audience only receives (Stage 4 · 2.10).
   *  `fresh`: a new session (after going on or off stage), so the others drop what was sent before. */
  watch(fresh = false): Promise<void> {
    return this.run(async () => { await this.rpc('session', fresh ? { fresh: true } : {}); });
  }

  /** Opens the session and sends my tracks (named after me so others can pull them). */
  start(peerId: string, stream: MediaStream, video: boolean, fresh = false): Promise<void> {
    return this.run(async () => {
      await this.rpc('session', fresh ? { fresh: true } : {});
      const audio = stream.getAudioTracks()[0] ?? null;
      const cam = video ? stream.getVideoTracks()[0] ?? null : null;
      const tracks: { tx: RTCRtpTransceiver; kind: MediaKind }[] = [];
      tracks.push({ tx: this.pc.addTransceiver(audio ?? 'audio', { direction: 'sendonly', streams: [stream], sendEncodings: [{ maxBitrate: 64_000 }] }), kind: 'audio' });
      if (video) tracks.push({ tx: this.pc.addTransceiver(cam ?? 'video', { direction: 'sendonly', streams: [stream], sendEncodings: CAMERA_LAYERS.map((e) => ({ ...e })) }), kind: 'video' });
      // A screen share has its own track, so people keep seeing the presenter's camera too.
      tracks.push({ tx: this.pc.addTransceiver('video', { direction: 'sendonly', sendEncodings: [{ maxBitrate: SCREEN_BITRATE, maxFramerate: 30 }] }), kind: 'screen' });
      for (const t of tracks) this.senders[t.kind] = t.tx.sender;
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      const out = await this.rpc('push', {
        sdp: offer.sdp,
        tracks: tracks.map((t) => ({ mid: t.tx.mid, trackName: `${peerId}-${t.kind}`, kind: t.kind === 'screen' ? 'video' : t.kind })),
      });
      await this.pc.setRemoteDescription(out.sessionDescription as Desc);
    });
  }

  /** Swaps what I send (a muted mic or camera sends nothing at all: no data, no SFU bandwidth). */
  async replace(kind: MediaKind, track: MediaStreamTrack | null) {
    const sender = this.senders[kind];
    if (!sender) return;
    await sender.replaceTrack(track).catch(() => {});
  }

  isPulled(trackName: string) { return this.pulled.has(trackName); }

  /** Starts receiving these people's tracks (cameras in the layer given). */
  pull(items: PullItem[]): Promise<void> {
    return this.run(async () => {
      const want = items.filter((i) => !this.pulled.has(i.track.trackName));
      if (!want.length || this.closed) return;
      const layer = (i: PullItem) => (kindOf(i.track) === 'video' ? i.layer ?? 'b' : undefined);
      const out = await this.rpc('pull', { tracks: want.map((i) => ({ sessionId: i.sessionId, trackName: i.track.trackName, rid: layer(i) })) });
      for (const t of (out.tracks as { mid?: string; trackName?: string; errorCode?: string }[] | undefined) ?? []) {
        const item = want.find((i) => i.track.trackName === t.trackName);
        if (!item || !t.mid || t.errorCode) continue;
        this.byMid.set(t.mid, { peerId: item.peerId, kind: kindOf(item.track) });
        this.pulled.set(item.track.trackName, t.mid);
        const l = layer(item);
        if (l) this.layers.set(item.track.trackName, l);
      }
      await this.settle(out);
    });
  }

  /** Changes which camera layer I receive (a tile grew or shrank, or my connection changed). */
  prefer(items: PullItem[]): Promise<void> {
    return this.run(async () => {
      const change = items.filter((i) => i.layer && kindOf(i.track) === 'video' && this.pulled.has(i.track.trackName) && this.layers.get(i.track.trackName) !== i.layer);
      if (!change.length || this.closed) return;
      for (const i of change) this.layers.set(i.track.trackName, i.layer!);
      const out = await this.rpc('layer', { tracks: change.map((i) => ({ sessionId: i.sessionId, trackName: i.track.trackName, mid: this.pulled.get(i.track.trackName), rid: i.layer })) });
      await this.settle(out);
    });
  }

  /** Stops receiving these tracks (someone left, or their video went off screen). */
  drop(trackNames: string[]): Promise<void> {
    return this.run(async () => {
      const mids = trackNames.map((n) => this.pulled.get(n)).filter((m): m is string => !!m);
      for (const n of trackNames) { this.pulled.delete(n); this.layers.delete(n); }
      if (!mids.length || this.closed) return;
      const out = await this.rpc('close', { mids });
      for (const m of mids) this.byMid.delete(m);
      await this.settle(out);
    });
  }

  close() {
    this.closed = true;
    this.pc.close();
  }
}
