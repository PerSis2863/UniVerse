// How a chat app checks a request from UniVerse (same scheme as webhooks, src/server/webhooks.ts):
// header "UniVerse-Signature: t=<seconds>,v1=<hex HMAC-SHA256 of `${t}.${body}`>", at most 5 minutes old.
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyWebhookSignature(body, header, secret, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const want = Buffer.from(createHmac('sha256', secret).update(`${t}.${body}`).digest('hex'));
  const got = Buffer.from(parts.v1);
  return want.length === got.length && timingSafeEqual(want, got);
}
