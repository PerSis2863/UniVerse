import { getCloudflareContext } from '@opennextjs/cloudflare';

// Live updates: each signed-in user has a RealtimeHub Durable Object (cloudflare/worker.ts) holding
// their open app/website tabs over WebSockets. publish() tells those tabs that something changed
// so they refetch right away instead of waiting for the next poll.

export type RealtimeEvent =
  | { type: 'chat'; conversationId: string } // new/edited message, reaction, poll vote, members
  | { type: 'typing'; conversationId: string; name: string } // someone is typing (shown, nothing refetched)
  | { type: 'notification' } // a new in-app notification
  | { type: 'refresh'; keys: string[] }; // SWR keys (or prefixes ending in "*") to revalidate

interface HubNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(url: string, init?: RequestInit): Promise<Response> };
}

declare global {
  interface CloudflareEnv {
    REALTIME?: HubNamespace;
  }
}

function hub(userId: string) {
  let ns: HubNamespace | undefined;
  try {
    ns = getCloudflareContext().env.REALTIME;
  } catch {
    return null;
  }
  return ns ? ns.get(ns.idFromName(userId)) : null;
}

/**
 * Sends an event to every open tab of these users. Resolves to the users who have UniVerse open
 * right now (null when live updates aren't available). Never rejects.
 */
export async function deliver(userIds: Iterable<string>, event: RealtimeEvent): Promise<Set<string> | null> {
  const ids = [...new Set(userIds)];
  const body = JSON.stringify(event);
  let available = true;
  const online = new Set<string>();
  await Promise.all(
    ids.map(async (id) => {
      const stub = hub(id);
      if (!stub) {
        available = false;
        return;
      }
      try {
        const res = await stub.fetch('https://realtime/publish', { method: 'POST', body });
        if (res.ok && ((await res.json()) as { sockets?: number }).sockets) online.add(id);
      } catch (e) {
        console.error('realtime publish failed:', e);
      }
    }),
  );
  return available ? online : null;
}

/** Sends an event to every open tab of these users, after the response. Never throws. */
export function publish(userIds: Iterable<string>, event: RealtimeEvent) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  const send = deliver(ids, event);
  try {
    getCloudflareContext().ctx.waitUntil(send);
  } catch {
    /* not on Workers */
  }
}

/** A one-time ticket that lets this user's browser open a WebSocket to their hub. */
export async function createTicket(userId: string): Promise<string | null> {
  const stub = hub(userId);
  if (!stub) return null;
  const res = await stub.fetch('https://realtime/ticket', { method: 'POST' });
  if (!res.ok) return null;
  return ((await res.json()) as { ticket: string }).ticket;
}

/** Tells everyone in a chat (plus `alsoNotify`, e.g. someone who just left) that it changed. */
export function publishChat(conversationId: string, alsoNotify: string[] = []) {
  const work = (async () => {
    const { default: prisma } = await import('@/lib/db');
    const members = await prisma.conversationParticipant.findMany({ where: { conversationId }, select: { userId: true } });
    publish([...members.map((m) => m.userId), ...alsoNotify], { type: 'chat', conversationId });
  })().catch((e) => console.error('realtime publishChat failed:', e));
  try {
    getCloudflareContext().ctx.waitUntil(work);
  } catch {
    /* not on Workers */
  }
}

/**
 * Tells the other people in a chat that `name` is typing. Their tabs show it without refetching
 * the chat: refetching everyone's whole thread every few seconds while someone typed was the
 * busiest work the server did.
 */
export function publishTyping(conversationId: string, userId: string, name: string) {
  const work = (async () => {
    const { default: prisma } = await import('@/lib/db');
    const members = await prisma.conversationParticipant.findMany({ where: { conversationId, userId: { not: userId } }, select: { userId: true } });
    publish(members.map((m) => m.userId), { type: 'typing', conversationId, name });
  })().catch((e) => console.error('realtime publishTyping failed:', e));
  try {
    getCloudflareContext().ctx.waitUntil(work);
  } catch {
    /* not on Workers */
  }
}
