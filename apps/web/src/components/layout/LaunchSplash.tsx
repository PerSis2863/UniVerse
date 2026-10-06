/**
 * The UniVerse logo while the installed app opens (like an app's launch screen). Shown only in the
 * installed app (display-mode: standalone, pure CSS, so it's there from the very first paint, before
 * any JavaScript runs); in a browser tab the page's own loading skeleton shows instead. When the app
 * is ready this unmounts and the app fades in (.shell-in).
 */
export function LaunchSplash({ always = false }: { always?: boolean }) {
  return (
    <div aria-hidden className={`launch-splash ${always ? 'launch-splash-always' : ''}`}>
      <div className="launch-splash-mark">
        {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG from /public, shown before React loads */}
        <img src="/logo.svg" alt="" width={88} height={88} />
        <span className="launch-splash-name">UniVerse</span>
        <span className="launch-splash-bar"><span /></span>
      </div>
    </div>
  );
}
