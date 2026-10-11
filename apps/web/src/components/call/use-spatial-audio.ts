'use client';

import { useEffect, useRef } from 'react';
import { panFor } from '@/lib/spatial-audio';

// Spatial audio (Stage 5 · B8.6): while on, each remote voice plays through Web Audio with a stereo
// pan from its tile's place on screen (the tiles' own videos are muted meanwhile), updated as the
// layout changes. Off: the tiles play their sound as before.

interface Voice { stream: MediaStream; el: HTMLAudioElement; src: MediaStreamAudioSourceNode; pan: StereoPannerNode }

export function useSpatialAudio(on: boolean, streams: { id: string; stream: MediaStream | null }[]) {
  const ctx = useRef<AudioContext | null>(null);
  const voices = useRef(new Map<string, Voice>());
  const key = streams.map((s) => `${s.id}:${s.stream?.id ?? ''}:${s.stream?.getAudioTracks().length ?? 0}`).join('|');
  const latest = useRef(streams);
  useEffect(() => { latest.current = streams; });

  useEffect(() => {
    const drop = (id: string) => {
      const v = voices.current.get(id);
      if (!v) return;
      v.src.disconnect(); v.pan.disconnect(); v.el.pause(); v.el.srcObject = null;
      voices.current.delete(id);
    };
    if (!on) { for (const id of [...voices.current.keys()]) drop(id); return; }
    const c = ctx.current ?? new AudioContext();
    ctx.current = c;
    void c.resume().catch(() => {});
    const want = new Map(latest.current.filter((s) => s.stream && s.stream.getAudioTracks().length).map((s) => [s.id, s.stream!]));
    for (const id of [...voices.current.keys()]) if (want.get(id) !== voices.current.get(id)!.stream) drop(id);
    for (const [id, stream] of want) {
      if (voices.current.has(id)) continue;
      // Chrome only lets Web Audio hear a call's sound while it also plays in an element (muted).
      const el = new Audio();
      el.muted = true; el.srcObject = stream;
      void el.play().catch(() => {});
      const src = c.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
      const pan = c.createStereoPanner();
      src.connect(pan).connect(c.destination);
      voices.current.set(id, { stream, el, src, pan });
    }
    // Where each tile is now (the layout changes as people come, go and share).
    const place = () => {
      const stage = document.querySelector('[data-call-stage]')?.getBoundingClientRect();
      for (const [id, v] of voices.current) {
        const tile = document.querySelector(`[data-peer="${CSS.escape(id)}"]`)?.getBoundingClientRect();
        const value = tile && stage ? panFor(tile.left + tile.width / 2, stage.left, stage.width) : 0;
        v.pan.pan.setTargetAtTime(value, c.currentTime, 0.2);
      }
    };
    place();
    const t = setInterval(place, 1500);
    return () => clearInterval(t);
  }, [on, key]);

  useEffect(() => () => {
    for (const v of voices.current.values()) { v.src.disconnect(); v.pan.disconnect(); v.el.pause(); }
    voices.current.clear();
    void ctx.current?.close().catch(() => {});
    ctx.current = null;
  }, []);
}
