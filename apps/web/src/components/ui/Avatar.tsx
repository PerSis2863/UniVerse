'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

// A person's photo, or their initials on a colour that's always the same for the same name.

const AVATAR_GRADIENTS = [
  'from-indigo-500 to-violet-500', 'from-sky-500 to-cyan-500', 'from-emerald-500 to-teal-500', 'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500', 'from-fuchsia-500 to-purple-500', 'from-blue-500 to-indigo-500', 'from-lime-500 to-emerald-500',
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
        <img loading="lazy" decoding="async" src={src} alt="" onError={() => setFailed(src)} className="w-full h-full rounded-full object-cover" />
      ) : (
        // Initials drawn by CSS: decoration, so they don't become a button's or link's name.
        <div aria-hidden data-initials={letters} className={cn('w-full h-full rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold before:content-[attr(data-initials)]', avatarGradient(name))} style={{ fontSize: size * 0.36 }} />
      )}
      {online && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#121830]" />}
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
        <div key={`${p.name}-${i}`} className="rounded-full ring-2 ring-white dark:ring-[#0b1020]">
          <Avatar name={p.name} src={p.avatar} size={size} />
        </div>
      ))}
      {rest > 0 && (
        <span className="rounded-full ring-2 ring-white dark:ring-[#0b1020] bg-zinc-200 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 font-semibold flex items-center justify-center" style={{ width: size, height: size, fontSize: size * 0.36 }}>
          +{rest}
        </span>
      )}
    </div>
  );
}
