// View-once messages (photos, videos, voice messages): each person can open one once. After that
// the server stops sending them the file. Shared by src/lib/chat.ts decorate and the fast path
// (cloudflare/fast-chat.ts), so it has no imports.

type Meta = { viewOnce?: boolean; openedBy?: string[] } & Record<string, unknown>;

export function applyViewOnce<T extends { senderId: unknown; attachmentUrl: unknown; metadata: unknown }>(m: T, viewerId: string): T {
  const meta = m.metadata as Meta | null;
  if (!meta?.viewOnce) return m;
  const openedBy = Array.isArray(meta.openedBy) ? meta.openedBy : [];
  if (m.senderId === viewerId) return { ...m, metadata: { ...meta, openedBy: undefined, openedCount: openedBy.length } };
  const opened = openedBy.includes(viewerId);
  return { ...m, attachmentUrl: opened ? null : m.attachmentUrl, metadata: { ...meta, openedBy: undefined, opened } };
}
