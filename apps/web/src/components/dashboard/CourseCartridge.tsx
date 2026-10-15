'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { generateJSON } from '@tiptap/react';
import { Download, FileArchive, Loader2, Upload } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { uploadChatFile } from '@/components/chat/chat-client';
import { lessonExtensions } from '@/components/lessons/LessonPage';
import { authedFetch, authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { buildCartridge, docToHtml, safeName, textToHtml, type CartridgeItem, type CartridgeQuestion } from '@/lib/cc-export';
import { htmlText, importBatches, pictureFiles, readCartridge, type ImportBatchItem, type ImportPlan } from '@/lib/cc-import';
import { PLAIN_PAGE_MAX, RICH_PAGE_MAX, type LessonNode } from '@/lib/lesson-page';

// Import and export a course as an IMS Common Cartridge (Stage 5 · B2): the format Canvas, Moodle,
// Blackboard, Brightspace and Schoology use. All in the browser: the cartridge is zipped or unzipped
// here (fflate), files are uploaded one by one, and the items go to the server a few at a time
// (src/server/course-cartridge.ts), so a big course never runs into the server's per-request limits.

const FILE_MAX = 25 * 1024 * 1024, ZIP_MAX = 300 * 1024 * 1024;
const MIME: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain', csv: 'text/csv', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', zip: 'application/zip',
};
const mimeOf = (name: string) => MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
const sizeText = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const KINDS: [string, string, string][] = [['PAGE', 'page', 'pages'], ['LINK', 'link', 'links'], ['VIDEO', 'video', 'videos'], ['FILE', 'file', 'files'], ['QUIZ', 'quiz', 'quizzes']];

interface ExportData {
  course: { code: string; name: string; description: string | null };
  modules: { title: string; summary: string | null; items: {
    id: string; kind: string; title: string; body?: string | null; rich?: boolean; url?: string | null;
    file?: { title: string; url: string } | null;
    quiz?: { title: string; description: string | null; questions: CartridgeQuestion[] } | null;
    assignment?: { title: string; instructions: string; maxScore: number; dueDate: string | null } | null;
  }[] }[];
}

export function CourseCartridge({ courseId, onClose, onImported }: { courseId: string; onClose: () => void; onImported: () => void }) {
  const [busy, setBusy] = useState<'export' | 'read' | 'import' | null>(null);
  const [status, setStatus] = useState('');
  const [plan, setPlan] = useState<{ plan: ImportPlan; files: Record<string, Uint8Array>; name: string } | null>(null);
  const [left, setLeft] = useState<{ title: string; why: string }[]>([]);
  const stop = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  // ── Export ────────────────────────────────────────────────────────────────────────────────
  const exportCourse = async () => {
    setBusy('export');
    setStatus('Reading the course…');
    try {
      const data = await authedJson<ExportData>(`/api/courses/${courseId}/cartridge`);
      const origin = window.location.origin;
      let bytes = 0, skipped = 0, n = 0;
      const total = data.modules.reduce((t, m) => t + m.items.length, 0);
      const modules = [];
      for (const m of data.modules) {
        const items: CartridgeItem[] = [];
        for (const it of m.items) {
          setStatus(`Adding ${++n} of ${total}…`);
          if (it.kind === 'PAGE') {
            let html = textToHtml(it.body ?? '');
            if (it.rich) {
              const page = await authedJson<{ body: string | null }>(`/api/courses/${courseId}/modules/${it.id}`);
              try { html = docToHtml(JSON.parse(page.body ?? '') as LessonNode, origin); } catch { html = ''; }
            }
            items.push({ kind: 'PAGE', title: it.title, html });
          } else if ((it.kind === 'LINK' || it.kind === 'VIDEO') && it.url) {
            items.push({ kind: 'LINK', title: it.title, url: it.url });
          } else if (it.kind === 'FILE' && it.file) {
            const url = it.file.url.startsWith('/') ? origin + it.file.url : it.file.url;
            const res = await (it.file.url.startsWith('/') ? authedFetch(it.file.url) : fetch(url)).catch(() => null);
            const size = Number(res?.headers.get('content-length') ?? 0);
            if (res?.ok && size <= FILE_MAX && bytes + size <= ZIP_MAX) {
              const data = new Uint8Array(await res.arrayBuffer());
              bytes += data.length;
              const fromUrl = decodeURIComponent(url.split('?')[0].split('/').pop() ?? '');
              items.push({ kind: 'FILE', title: it.title, name: /\.\w{2,5}$/.test(fromUrl) ? fromUrl : `${safeName(it.title)}${/\.\w{2,5}$/.test(it.file.title) ? it.file.title.slice(it.file.title.lastIndexOf('.')) : ''}`, data });
            } else items.push({ kind: 'LINK', title: it.title, url });
          } else if (it.kind === 'QUIZ' && it.quiz?.questions.length) {
            items.push({ kind: 'QUIZ', title: it.title, description: it.quiz.description, questions: it.quiz.questions.filter((q) => q.options.length >= 2 && q.options.includes(q.correct)) });
          } else if (it.kind === 'ASSIGNMENT' && it.assignment) {
            const a = it.assignment;
            const due = a.dueDate ? ` · due ${new Date(a.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}` : '';
            items.push({ kind: 'PAGE', title: it.title, html: `<p><strong>Assignment</strong> · up to ${a.maxScore} points${due}</p>${textToHtml(a.instructions)}` });
          } else skipped++;
        }
        modules.push({ title: m.title, summary: m.summary, items });
      }
      setStatus('Zipping…');
      const { zipSync } = await import('fflate');
      const zip = zipSync(buildCartridge({ ...data.course, modules }), { level: 6 });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
      a.download = `${safeName(data.course.code || 'course')}.imscc`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
      toast.success(`Cartridge downloaded${skipped ? ` (${plural(skipped, 'item')} left out: live classes and items no longer in the course)` : ''}`);
    } catch (e) {
      toast.error(errorMessage(e, 'The cartridge couldn’t be made. Try again.'));
    } finally {
      setBusy(null);
      setStatus('');
    }
  };

  // ── Import: read ──────────────────────────────────────────────────────────────────────────
  const choose = async (file: File | undefined) => {
    if (input.current) input.current.value = '';
    if (!file) return;
    if (file.size > ZIP_MAX) { toast.error('Cartridges can be up to 300 MB.'); return; }
    setBusy('read');
    setLeft([]);
    try {
      const { unzip } = await import('fflate');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const files = await new Promise<Record<string, Uint8Array>>((ok, fail) => unzip(bytes, (err, out) => (err ? fail(new Error('This file isn’t a cartridge (.imscc) or a zip.')) : ok(out))));
      setPlan({ plan: readCartridge(files), files, name: file.name });
    } catch (e) {
      toast.error(errorMessage(e, 'This cartridge couldn’t be read.'));
    } finally {
      setBusy(null);
    }
  };

  // ── Import: send ──────────────────────────────────────────────────────────────────────────
  const fileAt = (files: Record<string, Uint8Array>, paths: string[]) => {
    const keys = new Map(Object.keys(files).map((k) => [k.replace(/^\.?\//, '').toLowerCase(), k]));
    for (const p of paths) { const k = keys.get(p.toLowerCase()); if (k) return { name: p.split('/').pop() ?? 'file', data: files[k] }; }
    return null;
  };
  const upload = async (name: string, data: Uint8Array) => uploadChatFile(new File([data as BlobPart], safeName(name), { type: mimeOf(name) }));

  /** A cartridge page as the editor's JSON: its pictures uploaded, links inside the cartridge unwrapped. */
  const pageBody = async (title: string, html: string, path: string, files: Record<string, Uint8Array>) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const body = doc.body;
    // The title again at the top (exports often add it): once is enough.
    const first = body.querySelector('h1');
    if (first && first.textContent?.trim() === title.trim() && !first.previousElementSibling) first.remove();
    for (const img of [...body.querySelectorAll('img')]) {
      const src = img.getAttribute('src') ?? '';
      if (/^https?:\/\//i.test(src)) continue;
      const f = src.startsWith('data:') ? null : fileAt(files, pictureFiles(src, path));
      try {
        if (f && f.data.length <= FILE_MAX) img.setAttribute('src', await upload(f.name, f.data));
        else if (src.startsWith('data:image/')) img.setAttribute('src', await uploadChatFile(new File([await (await fetch(src)).blob()], 'picture.png', { type: 'image/png' })));
        else img.remove();
      } catch { img.remove(); }
    }
    for (const a of [...body.querySelectorAll('a[href]')]) {
      if (!/^(https?:|mailto:)/i.test(a.getAttribute('href') ?? '')) a.replaceWith(...a.childNodes);
    }
    const json = JSON.stringify(generateJSON(body.innerHTML, lessonExtensions()));
    return json.length <= RICH_PAGE_MAX ? json : htmlText(body.innerHTML).slice(0, PLAIN_PAGE_MAX);
  };

  const importPlan = async () => {
    if (!plan) return;
    setBusy('import');
    stop.current = false;
    const notIn = [...plan.plan.skipped];
    let modulesDone = 0;
    try {
      const mods = plan.plan.modules;
      for (const [mi, m] of mods.entries()) {
        if (stop.current) break;
        const items: ImportBatchItem[] = [];
        for (const [ii, it] of m.items.entries()) {
          if (stop.current) break;
          setStatus(`Module ${mi + 1} of ${mods.length}: getting ${ii + 1} of ${m.items.length} ready…`);
          if (it.kind === 'PAGE') items.push({ kind: 'PAGE', title: it.title, body: await pageBody(it.title, it.html, it.path, plan.files) });
          else if (it.kind === 'FILE') {
            const f = fileAt(plan.files, [it.path]);
            if (!f) { notIn.push({ title: it.title, why: 'missing from the cartridge' }); continue; }
            if (f.data.length > FILE_MAX) { notIn.push({ title: it.title, why: 'larger than 25 MB: upload it yourself' }); continue; }
            try { items.push({ kind: 'FILE', title: it.title, url: await upload(f.name, f.data), fileName: f.name, size: sizeText(f.data.length) }); }
            catch (e) { notIn.push({ title: it.title, why: errorMessage(e, 'it couldn’t be uploaded') }); }
          } else items.push(it);
        }
        if (stop.current || !items.length) continue;
        let moduleId: string | null = null;
        for (const [bi, batch] of importBatches(items).entries()) {
          setStatus(`Module ${mi + 1} of ${mods.length}: adding${bi ? ' more' : ''}…`);
          const out = await authedJson<{ moduleId: string }>(`/api/courses/${courseId}/import`, { method: 'POST', body: JSON.stringify({ moduleId, title: m.title, items: batch }) });
          moduleId = out.moduleId;
        }
        modulesDone++;
      }
      toast.success(`${plural(modulesDone, 'module')} imported, hidden from students until you show them`);
      setPlan(null);
    } catch (e) {
      toast.error(errorMessage(e, 'The import stopped. What was added so far stays (hidden from students).'));
    } finally {
      setLeft(notIn);
      setBusy(null);
      setStatus('');
      onImported();
    }
  };

  const counts = plan ? plan.plan.modules.flatMap((m) => m.items).reduce((c, it) => ({ ...c, [it.kind]: (c[it.kind] ?? 0) + 1 }), {} as Record<string, number>) : {};
  const summary = KINDS.filter(([k]) => counts[k]).map(([k, one, many]) => plural(counts[k], one, many)).join(' · ');

  return (
    <Sheet title="Import or export" onClose={() => { if (busy === 'import') stop.current = true; else if (!busy) onClose(); }}
      footer={plan ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => { if (busy === 'import') stop.current = true; else setPlan(null); }} className="btn-secondary flex-1 justify-center">{busy === 'import' ? 'Stop' : 'Cancel'}</button>
          <button type="button" onClick={() => void importPlan()} disabled={!!busy || !plan.plan.modules.length} className="btn-primary flex-1 justify-center">{busy === 'import' && <Loader2 className="w-4 h-4 animate-spin" />} Import {plural(plan.plan.modules.length, 'module')}</button>
        </div>
      ) : undefined}>
      <div className="space-y-6">
        {status && <p role="status" aria-live="polite" className="text-sm font-medium text-indigo-700 dark:text-indigo-300 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{status}</p>}
        {!plan && (
          <section aria-labelledby="cc-export" className="space-y-2">
            <h3 id="cc-export" className="text-sm font-bold text-zinc-900 dark:text-white">Export</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Download the modules as a Common Cartridge (.imscc) to open in Canvas, Moodle, Blackboard, Brightspace or Schoology. Pages, links, videos, files (up to 25 MB each) and quizzes go in; assignments go in as pages with their instructions. Live classes and students’ work stay here.</p>
            <button type="button" onClick={() => void exportCourse()} disabled={!!busy} className="btn-secondary btn-sm">{busy === 'export' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download .imscc</button>
          </section>
        )}
        {!plan ? (
          <section aria-labelledby="cc-import" className="space-y-2">
            <h3 id="cc-import" className="text-sm font-bold text-zinc-900 dark:text-white">Import</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Bring in a course exported from another system as a Common Cartridge (.imscc). Its folders become modules, hidden from students until you show them: pages, links, videos, files, and multiple-choice quizzes (as drafts). You see what’s in it before anything is added.</p>
            <input ref={input} type="file" accept=".imscc,.zip,application/zip" className="hidden" onChange={(e) => void choose(e.target.files?.[0])} />
            <button type="button" onClick={() => input.current?.click()} disabled={!!busy} className="btn-secondary btn-sm">{busy === 'read' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Choose a cartridge</button>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">Google Classroom doesn’t make cartridges: copy its materials in by hand for now.</p>
          </section>
        ) : (
          <section aria-labelledby="cc-plan" className="space-y-3">
            <h3 id="cc-plan" className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2"><FileArchive className="w-4 h-4 text-indigo-500" />{plan.plan.title || plan.name}</h3>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{summary || 'Nothing that can be imported.'}</p>
            <ol className="space-y-1.5">
              {plan.plan.modules.map((m, i) => (
                <li key={i} className="text-sm flex gap-2 text-zinc-800 dark:text-zinc-200"><span className="tabular-nums text-zinc-600 dark:text-zinc-400 w-6 shrink-0">{i + 1}.</span><span className="min-w-0 flex-1">{m.title} <span className="text-zinc-600 dark:text-zinc-400">· {plural(m.items.length, 'item')}</span></span></li>
              ))}
            </ol>
          </section>
        )}
        {(plan?.plan.skipped.length || left.length) ? (
          <details className="text-sm" open={!plan}>
            <summary className="cursor-pointer font-semibold text-zinc-900 dark:text-white">Not brought in ({(plan ? plan.plan.skipped : left).length})</summary>
            <ul className="mt-2 space-y-1 text-zinc-700 dark:text-zinc-300">
              {(plan ? plan.plan.skipped : left).slice(0, 100).map((s, i) => <li key={i}><span className="font-medium">{s.title || 'Untitled'}</span>: {s.why}</li>)}
            </ul>
          </details>
        ) : null}
      </div>
    </Sheet>
  );
}
