import type { Metadata } from 'next';

// Hyperion installs as its own computer app (M409, the owner, 22 Nov: "we need to make a software not just
// platform"): its pages name their own manifest (public/hyperion/manifest.json: its name, Σ icon, its own window,
// opening at /hyperion), so the browser offers Hyperion apart from UniVerse.
export const metadata: Metadata = { manifest: '/hyperion/manifest.json' };

export default function HyperionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
