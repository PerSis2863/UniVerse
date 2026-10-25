// Small shared effects for the UniVerse Play games (M35).

/** A burst of sparks from the middle of its box (CSS only; nothing with Reduce Motion). Re-key it
 *  to fire again. */
export function Burst({ color = '#34d399', n = 14, spread = 80 }: { color?: string; n?: number; spread?: number }) {
  return (
    <span className="play-burst pointer-events-none absolute inset-0" aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + (i % 2) * 0.3, d = spread * (0.55 + ((i * 37) % 10) / 22);
        return <i key={i} style={{ background: i % 3 ? color : '#ffffff', '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d}px`, animationDelay: `${(i % 4) * 18}ms` } as React.CSSProperties} />;
      })}
    </span>
  );
}
