import crypto from 'node:crypto';
import prisma from '@/lib/db';
import { BadRequestException } from './http';

// Stage 5 · C4: Webhook Event Dispatcher & HMAC SHA-256 Signatures.
// Dispatches real-time event notifications to external services with tamper-evident cryptographic proofs.

export const VALID_WEBHOOK_EVENTS = [
  'assignment.submitted',
  'grade.posted',
  'attendance.marked',
  'course.created',
  'member.joined',
] as const;

export type WebhookEvent = (typeof VALID_WEBHOOK_EVENTS)[number];

export function cleanWebhookEvents(raw: unknown): WebhookEvent[] {
  if (!Array.isArray(raw)) return ['assignment.submitted', 'grade.posted'];
  const valid = new Set<string>(VALID_WEBHOOK_EVENTS);
  const out = raw.filter((e) => typeof e === 'string' && valid.has(e)) as WebhookEvent[];
  return out.length > 0 ? out : ['assignment.submitted', 'grade.posted'];
}

export function computeWebhookSignature(payload: string, secret: string, timestamp: number): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestamp}.${payload}`);
  const signature = hmac.digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  const parts = signatureHeader.split(',');
  const tPart = parts.find((p) => p.startsWith('t='));
  const v1Part = parts.find((p) => p.startsWith('v1='));

  if (!tPart || !v1Part) return false;

  const timestamp = Number(tPart.slice(2));
  const signature = v1Part.slice(3);

  if (isNaN(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) {
    return false; // Signature expired or timestamp invalid
  }

  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function createWebhookEndpoint(params: {
  orgId: string;
  url: string;
  events: string[];
  description?: string | null;
}) {
  const rawUrl = params.url.trim();
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Invalid webhook destination URL.');
  }
  if (parsed.protocol !== 'https:' && !parsed.hostname.includes('localhost')) {
    throw new BadRequestException('Webhook URL must use secure HTTPS.');
  }

  const events = cleanWebhookEvents(params.events);
  const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;

  return prisma.webhookEndpoint.create({
    data: {
      organizationId: params.orgId,
      url: rawUrl,
      secret,
      events: JSON.stringify(events),
      description: params.description ? params.description.trim().slice(0, 200) : null,
    },
    select: {
      id: true,
      url: true,
      secret: true,
      events: true,
      isActive: true,
      description: true,
      createdAt: true,
    },
  });
}

export async function listWebhookEndpoints(orgId: string) {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      url: true,
      secret: true,
      events: true,
      isActive: true,
      description: true,
      createdAt: true,
      _count: { select: { deliveries: true } },
    },
  });

  return endpoints.map((ep) => ({
    ...ep,
    events: JSON.parse(ep.events || '[]') as WebhookEvent[],
  }));
}

export async function updateWebhookEndpoint(params: {
  endpointId: string;
  orgId: string;
  isActive?: boolean;
  events?: string[];
  description?: string | null;
}) {
  const existing = await prisma.webhookEndpoint.findFirst({
    where: { id: params.endpointId, organizationId: params.orgId },
  });
  if (!existing) throw new BadRequestException('Webhook endpoint not found.');

  const data: Record<string, unknown> = {};
  if (params.isActive !== undefined) data.isActive = params.isActive;
  if (params.events !== undefined) data.events = JSON.stringify(cleanWebhookEvents(params.events));
  if (params.description !== undefined) data.description = params.description ? params.description.trim().slice(0, 200) : null;

  return prisma.webhookEndpoint.update({
    where: { id: params.endpointId },
    data,
  });
}

export async function deleteWebhookEndpoint(endpointId: string, orgId: string) {
  const existing = await prisma.webhookEndpoint.findFirst({
    where: { id: endpointId, organizationId: orgId },
  });
  if (!existing) throw new BadRequestException('Webhook endpoint not found.');

  return prisma.webhookEndpoint.delete({
    where: { id: endpointId },
  });
}

export async function dispatchWebhookEvent(
  orgId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
) {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { organizationId: orgId, isActive: true },
  });

  const matching = endpoints.filter((ep) => {
    try {
      const evts = JSON.parse(ep.events) as string[];
      return evts.includes(event);
    } catch {
      return false;
    }
  });

  if (matching.length === 0) return { dispatched: 0 };

  const timestamp = Math.floor(Date.now() / 1000);
  const payloadObject = {
    id: `evt_${crypto.randomUUID().replace(/-/g, '')}`,
    event,
    createdAt: new Date().toISOString(),
    data,
  };
  const payloadString = JSON.stringify(payloadObject);

  const results = await Promise.allSettled(
    matching.map(async (ep) => {
      const signature = computeWebhookSignature(payloadString, ep.secret, timestamp);
      let statusCode: number | null = null;
      let status: 'SUCCESS' | 'FAILED' = 'FAILED';
      let errorMsg: string | null = null;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const res = await fetch(ep.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'UniVerse-Webhooks/1.0',
            'UniVerse-Signature': signature,
            'UniVerse-Event': event,
          },
          body: payloadString,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        statusCode = res.status;
        status = res.ok ? 'SUCCESS' : 'FAILED';
        if (!res.ok) errorMsg = `HTTP Error ${res.status}`;
      } catch (err: unknown) {
        errorMsg = err instanceof Error ? err.message : 'Network error';
      }

      await prisma.webhookDelivery.create({
        data: {
          webhookEndpointId: ep.id,
          event,
          payload: payloadString,
          statusCode,
          status,
          error: errorMsg,
          deliveredAt: status === 'SUCCESS' ? new Date() : null,
        },
      });

      return { endpointId: ep.id, status, statusCode };
    }),
  );

  return { dispatched: matching.length, results };
}

export async function listWebhookDeliveries(endpointId: string, orgId: string) {
  const ep = await prisma.webhookEndpoint.findFirst({
    where: { id: endpointId, organizationId: orgId },
  });
  if (!ep) throw new BadRequestException('Webhook endpoint not found.');

  return prisma.webhookDelivery.findMany({
    where: { webhookEndpointId: endpointId },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });
}
