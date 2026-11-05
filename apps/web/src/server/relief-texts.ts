import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { runsOrg, textNumber } from '@/lib/relief';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import type { Body } from './body';
import { featureOff } from './moderation';
import { coordinatorsOf, orgRole, refreshOrg, tellRelief } from './relief-orgs';

// UniVerse Relief text requests (M107, migration 0193; the owner's seven ideas: "SMS/WhatsApp requests
// behind a switch"). Someone without the app texts an organisation's number (a Twilio number, by SMS
// or WhatsApp). Twilio posts the message here; it lands in that organisation's inbox, which only its
// coordinators see (it holds the sender's phone number), and a coordinator puts it on the map as a
// need (/relief?text=<id>&org=<id>). Off until the owner turns on "Relief text requests" (owner console
// → Server → Feature switches; the Worker refuses this path while it's off) and sets TWILIO_AUTH_TOKEN
// in Cloudflare. Each message, and each thank-you reply, is a paid Twilio message: [owner].

const HOUR = 3_600_000;
/** Messages one phone may send in an hour; more are dropped without a reply (no cost). */
const PER_HOUR = 10;

/**
 * Twilio's request signature: base64 HMAC-SHA1, keyed with the account's Auth Token, of the full URL
 * Twilio called followed by every POST field's name and value, sorted by name
 * (twilio.com/docs/usage/webhooks/webhooks-security).
 */
export async function twilioSignature(token: string, url: string, params: Record<string, string>) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(token), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
  let bin = '';
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Compares without stopping at the first difference, so timing says nothing about the signature. */
function same(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
/** Twilio's answer: an empty one, or one thank-you message back to the sender. */
const twiml = (message?: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${message ? `<Message>${xml(message)}</Message>` : ''}</Response>`, { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } });

/** POST /relief/texts/inbound (public; Twilio's messaging webhook, form fields From, To, Body). */
export async function inboundText(req: Request, b: Body) {
  const token = (process.env.TWILIO_AUTH_TOKEN ?? '').trim();
  if (!token || (await featureOff('relief-sms'))) return new Response('Text requests are off.', { status: 503 });
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(b)) if (typeof v === 'string') params[k] = v;
  if (!same(await twilioSignature(token, req.url, params), req.headers.get('x-twilio-signature') ?? '')) return new Response('Bad signature.', { status: 403 });
  const to = textNumber(params.To), from = textNumber(params.From), body = (params.Body ?? '').trim().slice(0, 1000);
  if (!to || !from || !body) return twiml();
  const org = await prisma.reliefOrg.findUnique({ where: { textNumber: to }, select: { id: true, name: true } });
  if (!org) return twiml();
  if ((await prisma.reliefText.count({ where: { fromNumber: from, createdAt: { gt: new Date(Date.now() - HOUR) } } })) >= PER_HOUR) return twiml();
  const channel = /^whatsapp:/i.test(params.From ?? '') ? 'WHATSAPP' : 'SMS';
  await prisma.reliefText.create({ data: { orgId: org.id, channel, fromNumber: from, body } });
  await tellRelief(await coordinatorsOf(org.id), { title: `New ${channel === 'WHATSAPP' ? 'WhatsApp' : 'text'} request for ${org.name}`, body: body.slice(0, 140), link: `/relief/orgs?org=${org.id}&tab=needs`, tag: `relief-texts-${org.id}` });
  await refreshOrg(org.id);
  return twiml(`Thank you. ${org.name} got your message and a volunteer will get back to you.`);
}

/** A text of this organisation, for one of its coordinators. */
async function ownText(u: SessionUser, textId: string) {
  const t = await prisma.reliefText.findUnique({ where: { id: textId } });
  if (!t) throw new NotFoundException('That message is gone.');
  if (!runsOrg(await orgRole(u.id, t.orgId))) throw new ForbiddenException('Only the organisation’s coordinators can handle its messages.');
  return t;
}

/** POST /relief/texts/:id/close: handled another way (a call, a duplicate, not a request). */
export async function closeReliefText(u: SessionUser, textId: string) {
  const t = await ownText(u, textId);
  await prisma.reliefText.update({ where: { id: t.id }, data: { status: 'CLOSED', handledById: u.id, handledAt: new Date() } });
  await refreshOrg(t.orgId);
  return { ok: true };
}

/** Before a coordinator puts a text on the map (createReliefPost with textId): theirs to post, in that organisation's name. */
export async function textToPost(u: SessionUser, textId: string, orgId: string | null) {
  const t = await ownText(u, textId);
  if (t.orgId !== orgId) throw new BadRequestException('Post it in the name of the organisation that got the message.');
  if (t.status === 'POSTED') throw new BadRequestException('This message is on the map already.');
  return t;
}

/** …and once the need is posted: the text is marked as put on the map. */
export async function textPosted(u: SessionUser, t: { id: string; orgId: string }, postId: string) {
  await prisma.reliefText.update({ where: { id: t.id }, data: { status: 'POSTED', postId, handledById: u.id, handledAt: new Date() } });
  await refreshOrg(t.orgId);
}
