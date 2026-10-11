'use client';

import { authedJson } from '@/lib/authed-fetch';
import { decryptFrom, e2eSupported, encryptFor, exportPublic, newDeviceKey, type E2EPayload } from '@/lib/e2e';
import { outboxSupported, readDeviceKey, saveDeviceKey, type DeviceKeyRecord } from '@/lib/outbox';

// Private chats on this device (Stage 5 · B7.6; the crypto is src/lib/e2e.ts): this device's key
// (made once, kept in the offline store, wiped at sign-out, registered with the server daily), the
// devices of the people in a private chat, and encrypting / decrypting messages for it.

type Mine = Pick<DeviceKeyRecord, 'deviceId' | 'privateKey' | 'publicKey'>;
interface ChatDevice { userId: string; deviceId: string; publicKey: string; label: string | null }

let mine: Promise<Mine | null> | null = null, mineFor = '';

/** This device's key for this account, made and registered the first time (null: this browser can't). */
export function myDevice(userId: string): Promise<Mine | null> {
  if (mine && mineFor === userId) return mine;
  mineFor = userId;
  mine = (async () => {
    if (!outboxSupported() || !(await e2eSupported())) return null;
    let rec = await readDeviceKey();
    if (rec && rec.userId !== userId) rec = null;
    if (!rec) {
      const k = await newDeviceKey();
      rec = { id: 'device', deviceId: crypto.randomUUID().replace(/-/g, ''), privateKey: k.privateKey, publicKey: await exportPublic(k.publicKey), userId, registeredAt: 0 };
      await saveDeviceKey(rec);
    }
    if (Date.now() - rec.registeredAt > 86_400_000) {
      await authedJson('/api/chat/keys', { method: 'POST', body: JSON.stringify({ deviceId: rec.deviceId, publicKey: rec.publicKey, label: navigator.userAgent.includes('Mobile') ? 'Phone' : 'Computer' }) });
      rec = { ...rec, registeredAt: Date.now() };
      await saveDeviceKey(rec);
    }
    return { deviceId: rec.deviceId, privateKey: rec.privateKey, publicKey: rec.publicKey };
  })();
  mine.catch(() => { mine = null; });
  return mine;
}

const cache = new Map<string, { at: number; devices: Promise<ChatDevice[]> }>();
/** The devices of everyone in a private chat (asked again after 30 s, or when `fresh`). */
export function chatDevices(conversationId: string, fresh = false): Promise<ChatDevice[]> {
  const hit = cache.get(conversationId);
  if (hit && !fresh && Date.now() - hit.at < 30_000) return hit.devices;
  const devices = authedJson<{ devices: ChatDevice[] }>(`/api/chat/keys?conversationId=${encodeURIComponent(conversationId)}`).then((r) => r.devices);
  cache.set(conversationId, { at: Date.now(), devices });
  devices.catch(() => cache.delete(conversationId));
  return devices;
}

/** A message encrypted for every device in the chat (theirs and mine). */
export async function encryptForChat(conversationId: string, userId: string, text: string): Promise<E2EPayload> {
  const me = await myDevice(userId);
  if (!me) throw new Error('This browser can’t do private chats. Try an up-to-date Chrome, Edge, Firefox or Safari.');
  let devices = await chatDevices(conversationId);
  if (!devices.some((d) => d.deviceId === me.deviceId) || !devices.some((d) => d.userId !== userId)) devices = await chatDevices(conversationId, true);
  if (!devices.some((d) => d.userId !== userId)) throw new Error('They haven’t opened this private chat on a device yet. Ask them to open it once, then try again.');
  return encryptFor(text, { deviceId: me.deviceId, privateKey: me.privateKey }, devices.map((d) => ({ deviceId: d.deviceId, publicKey: d.publicKey })));
}

const plain = new Map<string, string>();
/** A message's text on this device; throws 'not-for-this-device' when it was sent before this device joined. */
export async function decryptForChat(conversationId: string, userId: string, messageId: string, p: E2EPayload): Promise<string> {
  const known = plain.get(messageId);
  if (known !== undefined) return known;
  const me = await myDevice(userId);
  if (!me) throw new Error('unsupported');
  if (!p.keys[me.deviceId]) throw new Error('not-for-this-device');
  let sender = (await chatDevices(conversationId)).find((d) => d.deviceId === p.from);
  sender ??= (await chatDevices(conversationId, true)).find((d) => d.deviceId === p.from);
  if (!sender) throw new Error('unknown-sender-device');
  const text = await decryptFrom(p, { deviceId: me.deviceId, privateKey: me.privateKey }, sender.publicKey);
  plain.set(messageId, text);
  return text;
}
