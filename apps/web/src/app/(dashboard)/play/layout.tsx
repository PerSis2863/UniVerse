import { shareMeta } from '@/lib/share-meta';

// UniVerse Play's pages (room invites are /play/game?room=…): the title, and the picture a shared link shows (src/lib/share-meta.ts).
export const metadata = shareMeta('play', 'Quiz battles, type races, world maps and 3D worlds. Play alone or share a room code and race your friends live.');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
