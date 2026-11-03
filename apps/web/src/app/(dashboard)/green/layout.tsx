import { shareMeta } from '@/lib/share-meta';

// UniVerse Green's pages: the title, and the picture a shared link shows (src/lib/share-meta.ts).
export const metadata = shareMeta('green', 'Log trees planted, kilometres cycled and waste recycled, see the CO₂ saved and beat a weekly challenge together.');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
