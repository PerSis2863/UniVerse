import { shareMeta } from '@/lib/share-meta';

// UniVerse Travel's pages: the title, and the picture a shared link shows (src/lib/share-meta.ts).
export const metadata = shareMeta('travel', 'Guides to see, eat and sleep anywhere in the world, the week’s weather, and stays, flights and tours to book.');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
