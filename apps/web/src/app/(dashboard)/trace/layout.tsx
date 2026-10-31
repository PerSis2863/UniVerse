import { shareMeta } from '@/lib/share-meta';

// UniVerse Trace's pages: the title, and the picture a shared link shows (src/lib/share-meta.ts).
export const metadata = shareMeta('trace', 'One signed code on every unit: buyers see it is genuine, shops earn points and brands watch every product move on a live map.');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
