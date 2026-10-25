'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { photoSrcSet } from '@/lib/image-sizes';

// A person's photo, or their initials on a colour that's always the same for the same name.

// The owner's dark blue and pink (24 Oct 2026), mixed eight ways, deep enough for white initials.
const AVATAR_GRADIENTS = [
  'from-indigo-500 to-indigo-700', 'from-fuchsia-500 to-fuchsia-700', 'from-indigo-600 to-fuchsia-600', 'from-fuchsia-600 to-indigo-700',
  'from-indigo-400 to-indigo-600', 'from-fuchsia-400 to-fuchsia-600', 'from-indigo-700 to-fuchsia-500', 'from-fuchsia-700 to-fuchsia-900',
];

/** The initials' background for a name (stable: the same person always gets the same colour). */
export function avatarGradient(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

export function Avatar({ name, src, size = 40, online }: { name: string; src?: string | null; size?: number; online?: boolean }) {
  const letters = name.split(/\s+/).filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  // A photo that fails to load (deleted, blocked, offline) falls back to the initials.
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {src && failed !== src ? (
        // eslint-disable-next-line @next/next/no-img-element -- user photos from R2 / Google, any size
        <img loading="lazy" decoding="async" src={src} {...photoSrcSet(src, size)} alt="" onError={() => setFailed(src)} className="w-full h-full rounded-full object-cover" />
      ) : (
        // Initials drawn by CSS: decoration, so they don't become a button's or link's name.
        <div aria-hidden data-initials={letters} className={cn('w-full h-full rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold before:content-[attr(data-initials)]', avatarGradient(name))} style={{ fontSize: size * 0.36 }} />
      )}
      {online && <span className="absolute bottom-0 end-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#141416]" />}
    </div>
  );
}

/** Overlapping avatars with a "+N" for the rest (members of a group, people on a call). */
export function AvatarStack({ people, max = 4, size = 28 }: { people: { name: string; avatar?: string | null }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex items-center -space-x-2" aria-label={people.map((p) => p.name).join(', ')}>
      {shown.map((p, i) => (
        <div key={`${p.name}-${i}`} className="rounded-full ring-2 ring-white dark:ring-[#0b0b0c]">
          <Avatar name={p.name} src={p.avatar} size={size} />
        </div>
      ))}
      {rest > 0 && (
        <span className="rounded-full ring-2 ring-white dark:ring-[#0b0b0c] bg-zinc-200 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 font-semibold flex items-center justify-center" style={{ width: size, height: size, fontSize: size * 0.36 }}>
          +{rest}
        </span>
      )}
    </div>
  );
}
