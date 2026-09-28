import { getCloudflareContext } from '@opennextjs/cloudflare';

// Live updates: each signed-in user has a RealtimeHub Durable Object (cloudflare/worker.ts) holding
// their open app/website tabs over WebSockets. publish() tells those tabs that something changed
// so they refetch right away instead of waiting for the next poll.

export type RealtimeEvent =
  | { type: 'chat'; conversationId: string } // new/edited message, reaction, poll vote, typing, members
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

/** Sends an event to every open tab of these users, after the response. Never throws. */
export function publish(userIds: Iterable<string>, event: RealtimeEvent) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  const body = JSON.stringify(event);
  const send = Promise.all(
    ids.map((id) =>
      hub(id)
        ?.fetch('https://realtime/publish', { method: 'POST', body })
        .catch((e) => console.error('realtime publish failed:', e)),
    ),
  );
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
