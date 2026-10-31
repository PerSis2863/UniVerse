'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { reducedMotion } from '@/lib/page-transition';

// The bright full-width panel (the Relay video's lime one, here in UniVerse's two tones): a mono
// caption, a line that types itself out and changes, and the logo in the middle, on a dotted grid.

const LINES = ['One app for the whole school.', 'The register that fills itself.', 'Grades parents can actually see.', 'Every language, both directions.'];

export function Statement() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { margin: '-120px' });
  const [text, setText] = useState(LINES[0]);
  useEffect(() => {
    if (!seen || reducedMotion()) return;
    let line = 0, n = 0, wait = 0;
    let deleting = false;
    // Types a line, waits, deletes it, types the next.
    const t = setInterval(() => {
      const full = LINES[line];
      if (wait) { wait--; return; }
      if (!deleting) {
        n++;
        if (n >= full.length) { deleting = true; wait = 28; }
      } else {
        n -= 2;
        if (n <= 0) { n = 0; deleting = false; line = (line + 1) % LINES.length; wait = 4; }
      }
      setText(LINES[line].slice(0, Math.max(0, n)));
    }, 55);
    return () => clearInterval(t);
  }, [seen]);

  return (
    <section className="px-3 sm:px-6 py-16">
      <div ref={ref} className="relative max-w-7xl mx-auto overflow-hidden rounded-[2rem] px-6 py-20 sm:py-28 text-center"
        style={{ background: 'linear-gradient(120deg, #a0a9cc 0%, #cbd2e6 35%, #ffd6f0 65%, #ffd6f0 100%)' }}>
        <div aria-hidden className="absolute inset-0 opacity-50" style={{ backgroundImage: 'radial-gradient(rgba(24,26,33,0.25) 1px, transparent 1.2px)', backgroundSize: '22px 22px' }} />
        <div className="relative">
          <p className="font-mono text-xs text-[#1e1d23]">| what UniVerse is</p>
          <p className="relative mt-6 min-h-[1.2em] text-4xl sm:text-6xl font-bold tracking-tight text-[#1d2650]">
            <span className="sr-only">{LINES.join(' ')}</span>
            <span aria-hidden>{text}</span><span aria-hidden className="inline-block w-[3px] h-[0.9em] -mb-[0.1em] ms-1 bg-[#24262e] animate-pulse" />
          </p>
          <div className="mt-12 inline-flex w-20 h-20 rounded-3xl bg-[#131a3d] items-center justify-center shadow-[0_20px_50px_-15px_rgba(36,38,46,0.7)]">
            <UniverseLogo size="sm" animated />
          </div>
        </div>
      </div>
    </section>
  );
}
