// Haptic feedback, like an app. Android: the vibration API. iPhone: Safari has no vibration API,
// but iOS 18's switch control gives the real system tap when it's toggled, so a hidden one is
// flipped. Both need a tap from the person first (always the case here: called from tap handlers).
// Not tied to "Reduce motion" (iOS keeps haptics with it on). Never throws.
const PATTERNS = { tap: 8, success: [10, 40, 12], warning: [18, 60, 18] } as const;

let iosSwitch: HTMLLabelElement | null = null;

function iosTap() {
  if (!iosSwitch) {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.setAttribute('data-no-track', '');
    label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    iosSwitch = label;
  }
  iosSwitch.click();
}

export function haptic(kind: keyof typeof PATTERNS = 'tap') {
  try {
    if (typeof navigator === 'undefined') return;
    // Turned off in Settings → Appearance.
    try { if (localStorage.getItem('uv-haptics') === 'off') return; } catch { /* private mode */ }
    // Browsers refuse (and log an error) before the person has tapped the page at least once.
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (activation && !activation.hasBeenActive) return;
    const ua = navigator.userAgent;
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERNS[kind] as number | number[]);
    } else if (/iP(hone|ad|od)/.test(ua)) {
      iosTap();
      if (kind !== 'tap') setTimeout(iosTap, 90); // success / warning: a double tap
    }
  } catch { /* unsupported */ }
}
