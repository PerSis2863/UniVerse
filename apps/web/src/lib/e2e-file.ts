// M341 (the owner, 19 Nov: "encrypted message system for security"): photos, files and voice notes in private (end-to-end
// encrypted) chats. The sender's device encrypts the file's bytes with a fresh AES-GCM key and uploads only the scrambled
// bytes (an `.enc` file, served as a download); the key, the address and what the file is travel inside the message,
// which is itself encrypted for the chat's devices (src/lib/e2e.ts). The server never sees the key, the name or the type.

import { b64, unb64 } from './e2e';
import { isUploadedFileUrl } from './file-urls';

/** What a private message carries for a file (inside its encrypted text). */
export interface PrivateFile {
  url: string; k: string; iv: string; name: string; mime: string; size: number;
  kind: 'image' | 'audio' | 'video' | 'file'; durationSec?: number; waveform?: number[]; caption?: string;
}

/** Marks a private message's text as a file rather than words (a character nobody types). */
const MARK = '\u0001uvfile:';

export const fileEnvelope = (f: PrivateFile) => MARK + JSON.stringify(f);

/** The file a private message's text describes, or null for an ordinary message. */
export function readEnvelope(text: string): PrivateFile | null {
  if (!text.startsWith(MARK)) return null;
  try {
    const f = JSON.parse(text.slice(MARK.length)) as PrivateFile;
    return typeof f.url === 'string' && typeof f.k === 'string' && typeof f.iv === 'string' && isUploadedFileUrl(f.url) ? f : null;
  } catch { return null; }
}

export const kindOf = (mime: string): PrivateFile['kind'] => (mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : 'file');

/** The file's bytes encrypted with a new key: the scrambled bytes to upload, and the key and nonce to send. */
export async function encryptFile(bytes: ArrayBuffer): Promise<{ data: Uint8Array<ArrayBuffer>; k: string; iv: string }> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  return { data, k: b64(await crypto.subtle.exportKey('raw', key)), iv: b64(iv) };
}

/** The original bytes back (throws if anything was changed on the way: AES-GCM checks every byte). */
export async function decryptFile(data: ArrayBuffer, k: string, iv: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', unb64(k), { name: 'AES-GCM' }, false, ['decrypt']);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, data);
}
