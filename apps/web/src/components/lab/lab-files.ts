'use client';

import type { Pixels } from '@/lib/lab/files';

// M383: the Lab's files, kept on this device (IndexedDB: files can be megabytes, too big for localStorage). Nothing
// is uploaded to the server. Pictures are decoded here (the engine's worker can't wait for the browser's decoder).

export interface Kept { name: string; bytes: Uint8Array }
const DB = 'uv-lab', STORE = 'files';
export const MAX_FILE = 50_000_000;

function db(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'name' }); };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((ok, fail) => {
    const req = work(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => { ok(req.result); d.close(); };
    req.onerror = () => { fail(req.error); d.close(); };
  });
}
/** Every kept file (none when the browser keeps no data, as in a private window). */
export async function keptFiles(): Promise<Kept[]> { try { return (await tx('readonly', (s) => s.getAll())) as Kept[]; } catch { return []; } }
export async function keep(name: string, bytes: Uint8Array) { try { await tx('readwrite', (s) => s.put({ name, bytes })); } catch { /* not kept: still there until the page closes */ } }
export async function forget(name: string) { try { await tx('readwrite', (s) => s.delete(name)); } catch { /* nothing kept */ } }

const PICTURE = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;
/** A picture's pixels, for imread (null for other files or one the browser can't open). */
export async function pixelsOf(name: string, bytes: Uint8Array): Promise<Pixels | null> {
  if (!PICTURE.test(name)) return null;
  try {
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
    const c = new OffscreenCanvas(bmp.width, bmp.height), ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);
    bmp.close();
    return { w: c.width, h: c.height, rgba: new Uint8Array(data.buffer) };
  } catch { return null; }
}
export const sizeText = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
