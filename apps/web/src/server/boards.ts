import { getCloudflareContext } from '@opennextjs/cloudflare';
import prisma from '@/lib/db';

// Whiteboards: who may open a board, and the BoardRoom Durable Object (cloudflare/worker.ts) that
// holds each board's drawing while people edit it together.

export type BoardRole = 'OWNER' | 'EDITOR' | 'VIEWER';
export type LinkAccess = 'NONE' | 'VIEW' | 'EDIT';
export const LINK_ACCESS: LinkAccess[] = ['NONE', 'VIEW', 'EDIT'];
export const MAX_BOARDS_PER_USER = 200;
export const MAX_BOARD_MEMBERS = 100;

interface RoomNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(url: string, init?: RequestInit): Promise<Response> };
}

declare global {
  interface CloudflareEnv {
    BOARDS?: RoomNamespace;
  }
}

function room(boardId: string) {
  let ns: RoomNamespace | undefined;
  try {
    ns = getCloudflareContext().env.BOARDS;
  } catch {
    return null;
  }
  return ns ? ns.get(ns.idFromName(boardId)) : null;
}

/** Calls the board's room; null when live whiteboards aren't available (e.g. `next dev`). */
export async function roomFetch(boardId: string, path: string, init?: RequestInit): Promise<Response | null> {
  const stub = room(boardId);
  if (!stub) return null;
  try {
    return await stub.fetch(`https://board${path}`, init);
  } catch (e) {
    console.error('board room call failed:', e);
    return null;
  }
}

/** Disconnects people whose access changed (they reconnect if they still have access). */
export function kick(boardId: string, opts: { userIds?: string[]; all?: boolean; wipe?: boolean }) {
  const p = roomFetch(boardId, '/kick', { method: 'POST', body: JSON.stringify(opts) });
  try {
    getCloudflareContext().ctx.waitUntil(p);
  } catch {
    /* not on Workers */
  }
  return p;
}

/** The caller's role on a board: owner, a member's role, or what the link allows. Null = no access. */
export async function boardAccess(boardId: string, userId: string) {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, title: true, ownerId: true, linkAccess: true, members: { where: { userId }, select: { role: true } } },
  });
  if (!board) return null;
  let role: BoardRole | null = null;
  if (board.ownerId === userId) role = 'OWNER';
  else if (board.members[0]) role = board.members[0].role === 'VIEWER' ? 'VIEWER' : 'EDITOR';
  // Anyone signed in with the link, when the owner allows it. Members keep the better of the two.
  if (board.linkAccess === 'EDIT' && role !== 'OWNER') role = 'EDITOR';
  else if (board.linkAccess === 'VIEW' && !role) role = 'VIEWER';
  return role ? { board, role } : null;
}

export const canEdit = (role: BoardRole) => role === 'OWNER' || role === 'EDITOR';
