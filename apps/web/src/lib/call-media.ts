'use client';

// Microphone and camera for calls (src/components/call/CallView.tsx).
//
// 1. The right devices. On a Mac signed in to the same Apple account as a nearby iPhone, the browser
//    may pick the iPhone as its microphone or camera (Continuity). The phone is then busy, so it
//    can't use its own microphone in the same call. Unless the person chose it, we pick the Mac's
//    own device instead, and remember any device they do choose.
// 2. Noise suppression, like Discord's: "Strong" runs RNNoise (a small neural network, on this
//    device, in an AudioWorklet) plus a noise gate that silences the gaps between words; "Standard"
//    is the browser's own; "Off" sends the raw microphone (music).

export type NoiseMode = 'strong' | 'standard' | 'off';

const KEY = { noise: 'uv-call-noise', mic: 'uv-call-mic', cam: 'uv-call-cam' } as const;
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };

export const noiseMode = (): NoiseMode => (['strong', 'standard', 'off'].includes(read(KEY.noise) ?? '') ? (read(KEY.noise) as NoiseMode) : 'strong');
export const setNoiseMode = (m: NoiseMode) => write(KEY.noise, m);
export const chosenDevice = (kind: 'mic' | 'cam') => read(KEY[kind]);
export const chooseDevice = (kind: 'mic' | 'cam', id: string | null) => write(KEY[kind], id);

/** Phones and tablets borrowed over Continuity (the person may well be using them themselves). */
const BORROWED = /iphone|ipad|continuity/i;

export function audioConstraints(mode: NoiseMode, deviceId?: string | null): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    echoCancellation: true,
    // RNNoise does the heavy lifting in "strong"; the browser's own suppressor stays on underneath.
    noiseSuppression: mode !== 'off',
    autoGainControl: mode !== 'off',
    channelCount: 1,
    // Voice isolation where the device has it (Macs, newer Chrome): keeps your voice and drops
    // echo and room sound. Unknown constraints are ignored elsewhere.
    ...(mode !== 'off' ? { voiceIsolation: true } : {}),
  } as MediaTrackConstraints;
}

/**
 * Opens the microphone (and camera), then swaps a borrowed iPhone/iPad device for this computer's
 * own one when there is one and the person didn't choose the phone.
 */
export async function openMedia(video: MediaTrackConstraints | false, mode: NoiseMode): Promise<MediaStream> {
  const mic = chosenDevice('mic');
  const cam = chosenDevice('cam');
  const want = (c: MediaTrackConstraints | false, id: string | null) => (c && id ? { ...c, deviceId: { ideal: id } } : c);
  let stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(mode, null), video: want(video, cam) })
    .catch(async (e) => {
      // A remembered device that's gone: open the defaults.
      if ((e as Error).name === 'OverconstrainedError') return navigator.mediaDevices.getUserMedia({ audio: audioConstraints(mode, null), video });
      throw e;
    });
  if (mic) stream = await swap(stream, 'audio', mic, mode);
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
  for (const kind of ['audio', 'video'] as const) {
    const track = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
    if (!track || (kind === 'audio' ? mic : cam) || !BORROWED.test(track.label)) continue;
    const own = devices.find((d) => d.kind === (kind === 'audio' ? 'audioinput' : 'videoinput') && d.deviceId && d.deviceId !== 'default' && !BORROWED.test(d.label));
    if (own) stream = await swap(stream, kind, own.deviceId, mode, video);
  }
  return stream;
}

/** Replaces one track of a stream with another device's (the old one is stopped). */
async function swap(stream: MediaStream, kind: 'audio' | 'video', deviceId: string, mode: NoiseMode, video?: MediaTrackConstraints | false): Promise<MediaStream> {
  try {
    const fresh = await navigator.mediaDevices.getUserMedia(kind === 'audio' ? { audio: audioConstraints(mode, deviceId) } : { video: { ...(video || {}), deviceId: { exact: deviceId } } });
    const next = fresh.getTracks()[0];
    for (const old of kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks()) { stream.removeTrack(old); old.stop(); }
    stream.addTrack(next);
  } catch { /* keep what we have */ }
  return stream;
}

export async function listDevices() {
  const all = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
  const named = (d: MediaDeviceInfo, i: number, fallback: string) => ({ id: d.deviceId, label: d.label || `${fallback} ${i + 1}` });
  return {
    mics: all.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications').map((d, i) => named(d, i, 'Microphone')),
    cams: all.filter((d) => d.kind === 'videoinput').map((d, i) => named(d, i, 'Camera')),
  };
}

// ── Noise suppression ────────────────────────────────────────────────────────────────────────

let wasm: Promise<ArrayBuffer> | null = null;

export interface CleanMic {
  /** What to send: the cleaned microphone. */
  track: MediaStreamTrack;
  stop: () => void;
}

/**
 * The microphone through RNNoise and a noise gate (strong), or as it is (standard, off).
 * Falls back to the raw microphone if this browser can't run it (no AudioWorklet or WebAssembly).
 */
export async function cleanMic(raw: MediaStreamTrack, mode: NoiseMode): Promise<CleanMic> {
  const passthrough = { track: raw, stop: () => {} };
  if (mode !== 'strong' || typeof AudioWorkletNode === 'undefined' || typeof WebAssembly === 'undefined') return passthrough;
  let ctx: AudioContext | null = null;
  try {
    const lib = await import('@sapphi-red/web-noise-suppressor');
    wasm ??= lib.loadRnnoise({ url: '/noise/rnnoise.wasm', simdUrl: '/noise/rnnoise_simd.wasm' });
    ctx = new AudioContext({ sampleRate: 48_000, latencyHint: 'interactive' }); // RNNoise works at 48 kHz
    await Promise.all([ctx.audioWorklet.addModule('/noise/rnnoiseWorklet.js'), ctx.audioWorklet.addModule('/noise/noiseGateWorklet.js')]);
    const wasmBinary = await wasm;
    const src = ctx.createMediaStreamSource(new MediaStream([raw]));
    // Rumble (desk knocks, fans, traffic) is below speech: cut it first.
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 85;
    const rnnoise = new lib.RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary });
    const gate = new lib.NoiseGateWorkletNode(ctx, { openThreshold: -48, closeThreshold: -54, holdMs: 180, maxChannels: 1 });
    const out = ctx.createMediaStreamDestination();
    src.connect(highpass).connect(rnnoise).connect(gate).connect(out);
    await ctx.resume().catch(() => {});
    const track = out.stream.getAudioTracks()[0];
    const c = ctx;
    return {
      track,
      stop: () => {
        try { src.disconnect(); rnnoise.destroy(); } catch { /* already closed */ }
        track.stop();
        void c.close().catch(() => {});
      },
    };
  } catch (e) {
    console.warn('Noise suppression unavailable', e);
    void ctx?.close().catch(() => {});
    return passthrough;
  }
}
