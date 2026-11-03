import type { Metadata } from 'next';
import { shareMeta } from '@/lib/share-meta';

// Public brand pages (UniVerse Trace): a brand's trust score, its products and what owners say,
// linked from every passport. Anyone can open one; no sign-in.
export const metadata: Metadata = {
  ...shareMeta('trace', 'One signed code on every unit: buyers see it is genuine, shops earn points and brands watch every product move on a live map.'),
  title: 'Brand on UniVerse Trace',
};

export default function BrandLayout({ children }: { children: React.ReactNode }) {
  return children;
}
