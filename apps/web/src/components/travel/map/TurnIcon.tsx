import { turnSign } from '@/lib/navigation';

// M260: a turn's arrow, drawn the way Google Maps and Apple Maps draw them: a stem from below that bends to the turn's
// angle (straight, slight, a turn, sharp; left or right), a U-turn, a roundabout, the start and the end.

/** The arrow's path for an angle from straight ahead (left negative), in a 24-unit box. */
function arrow(angle: number) {
  const a = (angle * Math.PI) / 180, bend: [number, number] = [12, 11.5];
  const tip: [number, number] = [bend[0] + Math.sin(a) * 8, bend[1] - Math.cos(a) * 8];
  const head = (d: number) => [tip[0] - Math.sin(a + d) * 4.2, tip[1] + Math.cos(a + d) * 4.2].map((v) => v.toFixed(2)).join(' ');
  // Straight ahead the stem runs up to the tip; otherwise it rises, then curves into the turn.
  const stem = angle ? `M12 22 L12 ${bend[1] + 3} Q12 ${bend[1]} ${(bend[0] + Math.sin(a) * 3).toFixed(2)} ${(bend[1] - Math.cos(a) * 3).toFixed(2)} L${tip[0].toFixed(2)} ${tip[1].toFixed(2)}` : `M12 22 L12 ${tip[1].toFixed(2)}`;
  return { stem, head: `M${head(-0.75)} L${tip[0].toFixed(2)} ${tip[1].toFixed(2)} L${head(0.75)}` };
}

export function TurnIcon({ type, mod, className }: { type: string; mod: string; className?: string }) {
  const s = turnSign(type, mod), line = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {'angle' in s ? (() => { const p = arrow(s.angle); return <><path d={p.stem} {...line} /><path d={p.head} {...line} /></>; })()
        : s.sign === 'uturn' ? <><path d="M16 21 V10 a4 4 0 0 0 -8 0 V15" {...line} /><path d="M4.8 12.2 L8 15.6 L11.2 12.2" {...line} /></>
        : s.sign === 'roundabout' ? <><circle cx="12" cy="11" r="4.2" {...line} /><path d="M12 22 V15.2" {...line} /><path d={mod.includes('left') ? 'M8.2 9.2 L3.5 6.5 M3.5 6.5 L4.4 10.4 M3.5 6.5 L7.3 5.4' : 'M15.8 9.2 L20.5 6.5 M20.5 6.5 L19.6 10.4 M20.5 6.5 L16.7 5.4'} {...line} /></>
        : s.sign === 'depart' ? <path d="M12 3 L19 20 L12 16 L5 20 Z" fill="currentColor" />
        : s.sign === 'stop' ? <><circle cx="12" cy="10" r="6.5" fill="currentColor" /><circle cx="12" cy="10" r="2.6" fill="var(--card-bg, #fff)" /><path d="M12 16.5 V22" {...line} /></>
        : <><path d="M6 22 V3.5" {...line} /><path d="M6 4 H18 L15.5 8 L18 12 H6" fill="currentColor" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" /></>}
    </svg>
  );
}
