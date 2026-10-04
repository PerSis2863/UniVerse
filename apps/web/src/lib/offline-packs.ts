'use client';
import { authedJson } from '@/lib/authed-fetch';
import { isUploadedFileUrl } from '@/lib/file-urls';

// Offline course packs: a course's announcements, materials (the files themselves), reading
// list, calendar and the student's flashcards, saved on the device with the Cache Storage API
// so they open with no connection (/student/offline). Nothing is sent anywhere: this only
// downloads what the student can already see. Files that can't be downloaded (links to other
// sites, very large files) stay "needs a connection".

const CACHE = 'course-packs-v1';
const INDEX = '/__offline-packs/index.json';
const MAX_FILE = 50 * 1024 * 1024;
const MAX_PACK = 200 * 1024 * 1024;

export interface PackFile { url: string; title: string; type: string; saved: boolean; bytes: number }
export interface PackSummary { courseId: string; code: string; name: string; savedAt: string; bytes: number; files: number; savedFiles: number }
export interface Pack {
  summary: PackSummary;
  board: {
    course: { id: string; code: string; name: string; teacher?: { name: string } | null };
    announcements: { id: string; title: string; body: string; createdAt: string; author: { name: string } }[];
    materials: { id: string; title: string; type: string; fileUrl: string; size: string | null }[];
    readings: { id: string; title: string; description: string | null; url: string | null }[];
    events: { id: string; title: string; startAt: string; type: string }[];
  };
  files: PackFile[];
  cards: { id: string; front: string; back: string }[];
}

export const offlineSupported = () => typeof window !== 'undefined' && 'caches' in window;

const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json' } });
const packKey = (courseId: string) => `/__offline-packs/${encodeURIComponent(courseId)}.json`;
const fileKey = (url: string) => `/__offline-packs/files/${encodeURIComponent(url)}`;

export async function listPacks(): Promise<PackSummary[]> {
  if (!offlineSupported()) return [];
  const c = await caches.open(CACHE);
  const res = await c.match(INDEX);
  return res ? ((await res.json()) as PackSummary[]) : [];
}

export async function getPack(courseId: string): Promise<Pack | null> {
  if (!offlineSupported()) return null;
  const res = await (await caches.open(CACHE)).match(packKey(courseId));
  return res ? ((await res.json()) as Pack) : null;
}

/** A URL the browser can open for a saved file (revoke it when done), or null if it isn't saved. */
export async function savedFileUrl(url: string): Promise<string | null> {
  if (!offlineSupported()) return null;
  const res = await (await caches.open(CACHE)).match(fileKey(url));
  return res ? URL.createObjectURL(await res.blob()) : null;
}

async function writeIndex(c: Cache, list: PackSummary[]) {
  await c.put(INDEX, json(list.sort((a, b) => a.code.localeCompare(b.code))));
}

/** Downloads a course for offline use. `onProgress` gets (done, total) as files download. */
export async function savePack(courseId: string, onProgress?: (done: number, total: number) => void): Promise<PackSummary> {
  if (!offlineSupported()) throw new Error('This browser can’t save courses for offline use.');
  const [board, cards] = await Promise.all([
    authedJson<Pack['board']>(`/api/courses/${encodeURIComponent(courseId)}/board`),
    authedJson<{ cards: Pack['cards'] }>(`/api/tutor/cards?courseId=${encodeURIComponent(courseId)}`).catch(() => ({ cards: [] })),
  ]);
  // Ask the browser to keep this storage (it may clear unpersisted storage when space runs low).
  await navigator.storage?.persist?.().catch(() => false);
  const c = await caches.open(CACHE);
  const files: PackFile[] = [];
  let bytes = 0;
  const materials = board.materials ?? [];
  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];
    const f: PackFile = { url: m.fileUrl, title: m.title, type: m.type, saved: false, bytes: 0 };
    // Only files uploaded to UniVerse (not videos on other sites, not web pages).
    if (isUploadedFileUrl(m.fileUrl) && bytes < MAX_PACK) {
      try {
        const res = await fetch(m.fileUrl, { mode: 'cors', credentials: 'omit' });
        const size = Number(res.headers.get('content-length') || 0);
        if (res.ok && size <= MAX_FILE) {
          const blob = await res.blob();
          if (blob.size <= MAX_FILE && bytes + blob.size <= MAX_PACK) {
            await c.put(fileKey(m.fileUrl), new Response(blob, { headers: { 'Content-Type': res.headers.get('content-type') || blob.type || 'application/octet-stream' } }));
            f.saved = true;
            f.bytes = blob.size;
            bytes += blob.size;
          }
        }
      } catch {
        /* blocked by the file host, or offline: stays "needs a connection" */
      }
    }
    files.push(f);
    onProgress?.(i + 1, materials.length);
  }
  const summary: PackSummary = {
    courseId, code: board.course.code, name: board.course.name, savedAt: new Date().toISOString(),
    bytes, files: files.length, savedFiles: files.filter((f) => f.saved).length,
  };
  const pack: Pack = {
    summary,
    board: {
      course: { id: board.course.id, code: board.course.code, name: board.course.name, teacher: board.course.teacher ? { name: board.course.teacher.name } : null },
      announcements: board.announcements ?? [], materials, readings: board.readings ?? [], events: board.events ?? [],
    },
    files,
    cards: (cards.cards ?? []).map(({ id, front, back }) => ({ id, front, back })),
  };
  await c.put(packKey(courseId), json(pack));
  await writeIndex(c, [...(await listPacks()).filter((p) => p.courseId !== courseId), summary]);
  // Keep the offline page itself on the device too, so it opens with no connection.
  await caches.open('pages-v2').then((pages) => pages.add('/student/offline')).catch(() => {});
  return summary;
}

export async function deletePack(courseId: string) {
  if (!offlineSupported()) return;
  const c = await caches.open(CACHE);
  const pack = await getPack(courseId);
  for (const f of pack?.files ?? []) await c.delete(fileKey(f.url));
  await c.delete(packKey(courseId));
  await writeIndex(c, (await listPacks()).filter((p) => p.courseId !== courseId));
}
