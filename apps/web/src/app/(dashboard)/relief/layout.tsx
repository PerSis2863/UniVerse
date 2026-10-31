import { shareMeta } from '@/lib/share-meta';

// UniVerse Relief's pages: the title, and the picture a shared link shows (src/lib/share-meta.ts).
export const metadata = shareMeta('relief', 'People post what they need, neighbours and NGOs offer what they have, and a live map matches them.');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
