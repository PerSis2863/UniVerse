/** The UniVerse logo as a small image (headers, banners, loading screens). */
export function LogoMark({ className = 'w-7 h-7' }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- a static SVG from /public; next/image can't optimise on Workers
  return <img src="/logo.svg" alt="" aria-hidden className={`${className} shrink-0 object-contain`} />;
}
