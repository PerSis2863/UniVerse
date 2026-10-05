/** A lost & found post (upgrade 7), as /api/campus/lost-found returns it. */
export interface LostFoundItem {
  id: string; kind: 'LOST' | 'FOUND'; title: string; description: string | null; photoUrl: string | null; location: string | null;
  status: 'OPEN' | 'RESOLVED' | 'HIDDEN'; createdAt: string; expiresAt: string; reporter: { id: string; name: string; avatar: string | null };
}
