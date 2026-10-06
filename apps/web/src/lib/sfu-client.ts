'use client';

// Bigger calls (src/server/calls.ts): one connection to Cloudflare's SFU instead of one per
// person. You send your microphone and camera once; the SFU forwards them to whoever pulls
// them. Each step goes through the call's room (cloudflare/worker.ts CallRoom → sfuOp), which
// holds the app secret. Steps run one at a time: the SFU wants each offer and answer finished
// before the next change.

export interface SfuTrack { trackName: string; kind: 'audio' | 'video' }
type Rpc = (op: string, body?: Record<string, unknown>) => Promise<Record<string, unknown>>;
interface Desc { type: RTCSdpType; sdp: string }

/** Encoding caps for the SFU: everyone's video goes to many people, so keep it lean. */
const CAMERA_BITRATE = 700_000;
const SCREEN_BITRATE = 2_500_000;

/** What a track is: a microphone, a camera, or a shared screen (sent beside the camera). */
export type MediaKind = 'audio' | 'video' | 'screen';
/** Screens are published as "<peer>-screen" (a video track of their own). */
export const kindOf = (t: SfuTrack): MediaKind => (t.kind === 'video' && t.trackName.endsWith('-screen') ? 'screen' : t.kind);

export class SfuLink {
  readonly pc: RTCPeerConnection;
  private queue: Promise<unknown> = Promise.resolve();
  /** mid → whose track it is. */
  private byMid = new Map<string, { peerId: string; kind: MediaKind }>();
  /** trackName → mid, for tracks pulled now. */
  private pulled = new Map<string, string>();
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

  /** Opens the session and sends my tracks (named after me so others can pull them). */
  start(peerId: string, stream: MediaStream, video: boolean): Promise<void> {
    return this.run(async () => {
      await this.rpc('session');
      const audio = stream.getAudioTracks()[0] ?? null;
      const cam = video ? stream.getVideoTracks()[0] ?? null : null;
      const tracks: { tx: RTCRtpTransceiver; kind: MediaKind }[] = [];
      tracks.push({ tx: this.pc.addTransceiver(audio ?? 'audio', { direction: 'sendonly', streams: [stream], sendEncodings: [{ maxBitrate: 64_000 }] }), kind: 'audio' });
      if (video) tracks.push({ tx: this.pc.addTransceiver(cam ?? 'video', { direction: 'sendonly', streams: [stream], sendEncodings: [{ maxBitrate: CAMERA_BITRATE, maxFramerate: 30 }] }), kind: 'video' });
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

  /** Starts receiving these people's tracks. */
  pull(items: { peerId: string; sessionId: string; track: SfuTrack }[]): Promise<void> {
    return this.run(async () => {
      const want = items.filter((i) => !this.pulled.has(i.track.trackName));
      if (!want.length || this.closed) return;
      const out = await this.rpc('pull', { tracks: want.map((i) => ({ sessionId: i.sessionId, trackName: i.track.trackName })) });
      for (const t of (out.tracks as { mid?: string; trackName?: string; errorCode?: string }[] | undefined) ?? []) {
        const item = want.find((i) => i.track.trackName === t.trackName);
        if (!item || !t.mid || t.errorCode) continue;
        this.byMid.set(t.mid, { peerId: item.peerId, kind: kindOf(item.track) });
        this.pulled.set(item.track.trackName, t.mid);
      }
      await this.settle(out);
    });
  }

  /** Stops receiving these tracks (someone left, or their video went off screen). */
  drop(trackNames: string[]): Promise<void> {
    return this.run(async () => {
      const mids = trackNames.map((n) => this.pulled.get(n)).filter((m): m is string => !!m);
      for (const n of trackNames) this.pulled.delete(n);
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
