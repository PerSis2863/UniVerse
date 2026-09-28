// Light haptic feedback where the browser supports it (Android Chrome; iOS Safari ignores it).
// Respects "Reduce motion" and never throws.
const PATTERNS = { tap: 8, success: [10, 40, 12], warning: [18, 60, 18] } as const;

export function haptic(kind: keyof typeof PATTERNS = 'tap') {
  try {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    navigator.vibrate(PATTERNS[kind] as number | number[]);
  } catch { /* unsupported */ }
}
