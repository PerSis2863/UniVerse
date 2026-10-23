// Browsers too old for the app, and robots: their error reports aren't faults in UniVerse (the
// app needs about Chrome/Edge 100, Firefox 100 or Safari 15.4 from 2022). Shared by the error
// recorder (src/server/errors.ts) and the owner console's error hub.

const BOT = /bot\b|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|headlesschrome|lighthouse|pingdom|uptime/i;

/** Why a browser can't run the app (a short reason), or null when it's a supported one. */
export function unsupportedBrowser(ua: string | null | undefined): string | null {
  if (!ua) return null;
  if (BOT.test(ua)) return 'an automated visitor (a bot or monitoring tool)';
  // macOS versions before 10 don't exist with a modern browser: a made-up user agent.
  if (/Mac OS X [1-9]_/.test(ua)) return 'a made-up browser signature (usually a bot)';
  const chrome = /(?:Chrome|CriOS)\/(\d+)/.exec(ua)?.[1];
  if (chrome && Number(chrome) < 100) return `Chrome ${chrome}, too old for the app (it needs 100 or newer)`;
  const firefox = /(?:Firefox|FxiOS)\/(\d+)/.exec(ua)?.[1];
  if (firefox && Number(firefox) < 100) return `Firefox ${firefox}, too old for the app (it needs 100 or newer)`;
  if (!chrome && !firefox && /Safari\//.test(ua)) {
    const v = /Version\/(\d+)\.(\d+)/.exec(ua);
    if (v && (Number(v[1]) < 15 || (Number(v[1]) === 15 && Number(v[2]) < 4))) return `Safari ${v[1]}.${v[2]}, too old for the app (it needs 15.4 or newer)`;
  }
  return null;
}

/** The note an ignored report of such a browser carries in the error hub. */
export const unsupportedNote = (reason: string) =>
  `**Outdated browser or bot**\n\n**Likely cause:** The report came from ${reason}, not from a fault in UniVerse.\n\n**Where to look:** Nowhere: people on a current browser don't see it.\n\n**Suggested fix:** None needed. It was filed as ignored automatically.`;
