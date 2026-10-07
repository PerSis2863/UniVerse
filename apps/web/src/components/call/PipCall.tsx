'use client';

import { useEffect, useRef } from 'react';
import { ArrowUpLeft, Hand, Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';
import { cn } from '@/lib/utils';

// The call in a floating window (Stage 4 · 2.12): Chrome's Document Picture-in-Picture keeps a small
// window with the call and its main controls on top while you use other apps. CallView renders this
// into that window with a portal. Videos here are muted: the call's sound keeps playing in the tab.

export interface PipTile { id: string; name: string; stream: MediaStream | null; video: boolean; muted: boolean; me?: boolean; screen?: boolean }

function Tile({ t, big }: { t: PipTile; big?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (v && v.srcObject !== t.stream) v.srcObject = t.stream;
  }, [t.stream]);
  const initials = t.name.split(/\s+/).map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  return (
    <div className={cn('relative rounded-xl overflow-hidden bg-[#161c33] flex items-center justify-center', big ? 'col-span-2 aspect-video' : 'aspect-video')}>
      {t.video && t.stream ? (
        <video ref={ref} autoPlay playsInline muted className={cn('w-full h-full', t.screen ? 'object-contain bg-black' : 'object-cover', t.me && !t.screen && '-scale-x-100')} />
      ) : (
        <span className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-xs font-bold">{initials}</span>
      )}
      <span className="absolute left-1.5 bottom-1.5 max-w-[85%] truncate rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium flex items-center gap-1">
        {t.muted && <MicOff className="w-2.5 h-2.5 text-rose-300 shrink-0" />}{t.screen ? `${t.name}’s screen` : t.me ? 'You' : t.name}
      </span>
    </div>
  );
}

export function PipCall({ title, clock, tiles, muted, camera, hand, watching, onMute, onCamera, onHand, onBack, onLeave }: {
  title: string; clock: string; tiles: PipTile[]; muted: boolean; camera: boolean; hand: boolean;
  /** A webinar's audience: no microphone or camera buttons. */ watching: boolean;
  onMute: () => void; onCamera: () => void; onHand: () => void; onBack: () => void; onLeave: () => void;
}) {
  const big = tiles.find((t) => t.screen);
  const rest = tiles.filter((t) => t !== big).slice(0, big ? 2 : 4);
  const btn = 'w-10 h-10 rounded-full flex items-center justify-center transition-colors';
  return (
    <div className="h-[100dvh] flex flex-col bg-[#0b0e1a] text-white p-2 gap-2 select-none">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-xs font-semibold truncate">{title}</p>
        <span className="text-[11px] text-zinc-400 tabular-nums shrink-0">{clock}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden grid grid-cols-2 gap-1.5 content-start">
        {big && <Tile t={big} big />}
        {rest.map((t) => <Tile key={t.id} t={t} />)}
      </div>
      <div className="flex items-center justify-center gap-2 pb-1">
        {!watching && (
          <>
            <button type="button" onClick={onMute} aria-label={muted ? 'Unmute' : 'Mute'} className={cn(btn, muted ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/20')}>{muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}</button>
            <button type="button" onClick={onCamera} aria-label={camera ? 'Turn camera off' : 'Turn camera on'} className={cn(btn, camera ? 'bg-gradient-to-br from-indigo-500 to-fuchsia-500' : 'bg-white/10 hover:bg-white/20')}>{camera ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}</button>
          </>
        )}
        <button type="button" onClick={onHand} aria-label={hand ? 'Lower your hand' : 'Raise your hand'} className={cn(btn, hand ? 'bg-amber-400 text-amber-950' : 'bg-white/10 hover:bg-white/20')}><Hand className="w-4 h-4" /></button>
        <button type="button" onClick={onBack} aria-label="Back to the call tab" title="Back to the call" className={cn(btn, 'bg-white/10 hover:bg-white/20')}><ArrowUpLeft className="w-4 h-4" /></button>
        <button type="button" onClick={onLeave} aria-label="Leave call" className={cn(btn, 'bg-rose-600 hover:bg-rose-500')}><PhoneOff className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
