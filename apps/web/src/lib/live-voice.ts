'use client';

// A spoken conversation with Gemini Live, in the browser (the voice tutor, and the AI examiner in
// Stage 5 · D11). The server hands out a single-use token with the instructions locked in; the
// microphone streams straight to Gemini and the spoken replies play here, with live captions of
// both sides. For an oral check the microphone is also recorded (the student's voice only, small
// Opus audio) for the teacher.

export type LiveWho = 'you' | 'ai';
export interface LiveHandle {
  /** Ends the conversation; resolves to the recording when one was asked for. */
  stop: () => Promise<Blob | null>;
  setMuted: (muted: boolean) => void;
}

const toBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** The microphone, with echo cancellation (throws NotAllowedError when it's refused). */
export const openMic = () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });

export async function startLiveVoice(o: {
  mic: MediaStream;
  token: string;
  model: string;
  onText: (who: LiveWho, text: string) => void;
  onSpeaking: (speaking: boolean) => void;
  /** Gemini ended the conversation (e.g. the time ran out). */
  onClosed: () => void;
  onError?: () => void;
  /** A first message so the AI speaks first (an examiner opens the exam). */
  kickoff?: string;
  /** Also record the microphone. */
  record?: boolean;
}): Promise<LiveHandle> {
  const { GoogleGenAI, Modality } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: o.token, httpOptions: { apiVersion: 'v1alpha' } });
  const input = new AudioContext({ sampleRate: 16000 });
  const output = new AudioContext({ sampleRate: 24000 });
  await input.audioWorklet.addModule('/voice-worklet.js');
  const source = input.createMediaStreamSource(o.mic);
  const capture = new AudioWorkletNode(input, 'pcm-capture');
  source.connect(capture);
  let playAt = 0;
  const playing = new Set<AudioBufferSourceNode>();
  let muted = false;
  let closed = false;

  const recorder = o.record && typeof MediaRecorder !== 'undefined'
    ? new MediaRecorder(o.mic, { ...(MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? { mimeType: 'audio/webm;codecs=opus' } : {}), audioBitsPerSecond: 12_000 })
    : null;
  const chunks: Blob[] = [];
  if (recorder) { recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); }; recorder.start(5000); }

  const session = await ai.live.connect({
    model: o.model,
    config: { responseModalities: [Modality.AUDIO] },
    callbacks: {
      onmessage: (m) => {
        const sc = m.serverContent;
        if (!sc) return;
        if (sc.interrupted) { for (const s of playing) try { s.stop(); } catch { /* done */ } playing.clear(); playAt = 0; o.onSpeaking(false); }
        if (sc.inputTranscription?.text) o.onText('you', sc.inputTranscription.text);
        if (sc.outputTranscription?.text) o.onText('ai', sc.outputTranscription.text);
        for (const part of sc.modelTurn?.parts ?? []) {
          const data = part.inlineData?.data;
          if (!data) continue;
          const bin = atob(data);
          const pcm = new Int16Array(bin.length / 2);
          for (let i = 0; i < pcm.length; i++) pcm[i] = (bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)) << 16 >> 16;
          const buf = output.createBuffer(1, pcm.length, 24000);
          const ch = buf.getChannelData(0);
          for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
          const node = output.createBufferSource();
          node.buffer = buf;
          node.connect(output.destination);
          playAt = Math.max(playAt, output.currentTime);
          node.start(playAt);
          playAt += buf.duration;
          playing.add(node);
          o.onSpeaking(true);
          node.onended = () => { playing.delete(node); if (!playing.size) o.onSpeaking(false); };
        }
      },
      onerror: () => o.onError?.(),
      onclose: () => { if (!closed) o.onClosed(); },
    },
  });

  capture.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    if (muted || closed) return;
    session.sendRealtimeInput({ audio: { data: toBase64(e.data), mimeType: 'audio/pcm;rate=16000' } });
  };
  if (o.kickoff) session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: o.kickoff }] }], turnComplete: true });

  return {
    setMuted: (m) => { muted = m; },
    stop: async () => {
      if (closed) return null;
      closed = true;
      try { session.close(); } catch { /* closed */ }
      capture.port.onmessage = null;
      source.disconnect();
      for (const s of playing) try { s.stop(); } catch { /* done */ }
      const blob = recorder && recorder.state !== 'inactive'
        ? await new Promise<Blob | null>((resolve) => { recorder.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: (recorder.mimeType || 'audio/webm').split(';')[0] }) : null); recorder.stop(); })
        : null;
      o.mic.getTracks().forEach((t) => t.stop());
      void input.close().catch(() => {});
      void output.close().catch(() => {});
      o.onSpeaking(false);
      return blob;
    },
  };
}
