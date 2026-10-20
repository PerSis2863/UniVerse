'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Download, Loader2, Sparkles } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Segmented } from '@/components/ui/Segmented';
import { authedJson } from '@/lib/authed-fetch';
import { CV_TEMPLATES, cvHtml, type CvTemplate } from '@/lib/cv-html';
import { cleanPassportTheme, type PassportTheme } from '@/lib/passport-theme';
import type { PassportData } from './PassportView';

// The CV builder (Stage 5 · Q14): a CV made from the skills passport, in one of three looks, with
// a short profile the student writes or has AI draft from their evidence (one AI request), saved as
// a PDF made on this device. Nothing is added that the student didn't choose: no email or phone
// unless they type it.

type CvData = PassportData & { strengths: string | null; theme: PassportTheme; portfolioUrl: string | null };
// Also the colour of the CV's small headings, so each is at least 4.5:1 on white.
const ACCENT: Record<PassportTheme, string> = { indigo: '#4f46e5', emerald: '#047857', slate: '#334155', rose: '#e11d48', amber: '#b45309' };
const PARTS = [
  { key: 'evidence', label: 'Skills shown in checked work' },
  { key: 'credentials', label: 'Verified experience' },
  { key: 'impact', label: 'Impact' },
  { key: 'skills', label: 'Skills' },
  { key: 'courses', label: 'Courses' },
] as const;
type PartKey = (typeof PARTS)[number]['key'];

export function CvBuilder({ onClose }: { onClose: () => void }) {
  const { data, error } = useSWR<CvData>('/api/passport/cv', authedJson);
  const [template, setTemplate] = useState<CvTemplate>('modern');
  const [edits, setEdits] = useState<{ name?: string; headline?: string; contact?: string; summary?: string }>({});
  const [parts, setParts] = useState<Record<PartKey, boolean>>({ evidence: true, credentials: true, impact: true, skills: true, courses: false });
  const [withLink, setWithLink] = useState(true);
  const [busy, setBusy] = useState<'ai' | 'pdf' | null>(null);

  const form = {
    name: edits.name ?? data?.name ?? '',
    headline: edits.headline ?? data?.headline ?? '',
    contact: edits.contact ?? '',
    summary: edits.summary ?? data?.strengths ?? '',
  };
  const html = useMemo(() => (data ? cvHtml({
    template,
    accent: ACCENT[cleanPassportTheme(data.theme)],
    name: form.name || data.name,
    headline: form.headline,
    contact: form.contact,
    summary: form.summary,
    portfolioUrl: withLink ? data.portfolioUrl : null,
    evidence: parts.evidence ? data.evidence?.map((g) => ({ label: g.label, count: g.count, best: g.best })) : undefined,
    credentials: parts.credentials ? data.credentials : undefined,
    impact: parts.impact ? data.impact : undefined,
    skills: parts.skills ? data.skills : undefined,
    courses: parts.courses ? data.courses : undefined,
  }) : ''), [data, template, form.name, form.headline, form.contact, form.summary, withLink, parts]);

  const draft = async () => {
    setBusy('ai');
    try {
      const r = await authedJson<{ summary: string }>('/api/passport/cv/summary', { method: 'POST' });
      setEdits((e) => ({ ...e, summary: r.summary }));
      toast.success('Drafted from your evidence. Change any word.');
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };
  const savePdf = async () => {
    setBusy('pdf');
    try {
      const { documentToPdf } = await import('@/components/docs/doc-to-pdf');
      const title = `${form.name || data?.name || 'My'} CV`;
      const blob = await documentToPdf(new File([html], 'cv.html', { type: 'text/html' }), html, title);
      const href = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href, download: `${title.replace(/[^\p{L}\p{N} -]+/gu, '').trim().replace(/\s+/g, '-') || 'CV'}.pdf` });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 2000);
      toast.success('Your CV is saved as a PDF');
    } catch (e) { toast.error((e as Error).message || 'Couldn’t make the PDF.'); }
    finally { setBusy(null); }
  };

  return (
    <Sheet title="Make my CV" onClose={onClose} wide footer={
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-zinc-600 dark:text-zinc-400 flex-1 min-w-[12rem]">Made on this device. Check it before you send it.</p>
        <button type="button" onClick={onClose} className="btn-secondary btn-sm">Close</button>
        <button type="button" onClick={() => void savePdf()} disabled={!data || !!busy} className="btn-primary btn-sm">{busy === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}Save as PDF</button>
      </div>
    }>
      {error ? <p className="text-sm text-rose-700 dark:text-rose-300">{(error as Error).message}</p> : !data ? <div className="h-64 rounded-2xl skeleton" /> : (
        <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="space-y-3">
            <Segmented<CvTemplate> label="Look" value={template} onChange={setTemplate} segments={CV_TEMPLATES} className="w-full" />
            <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">Name
              <input value={form.name} maxLength={100} onChange={(e) => setEdits({ ...edits, name: e.target.value })} className="input mt-1" />
            </label>
            <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">Headline
              <input value={form.headline} maxLength={140} onChange={(e) => setEdits({ ...edits, headline: e.target.value })} className="input mt-1" placeholder="Computer science student · climate volunteer" />
            </label>
            <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">Email or phone (optional)
              <input value={form.contact} maxLength={140} onChange={(e) => setEdits({ ...edits, contact: e.target.value })} className="input mt-1" placeholder="Only what you type here is added" />
            </label>
            <div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="cv-summary" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Profile</label>
                <button type="button" onClick={() => void draft()} disabled={!!busy} className="btn-ghost btn-sm">{busy === 'ai' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Draft with AI</button>
              </div>
              <textarea id="cv-summary" value={form.summary} maxLength={700} rows={4} onChange={(e) => setEdits({ ...edits, summary: e.target.value })} className="input mt-1" placeholder="Two or three sentences about what you’re good at." />
            </div>
            <fieldset>
              <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1">Include</legend>
              {PARTS.map((part) => (
                <label key={part.key} className="flex items-center gap-2 py-0.5 text-sm text-zinc-800 dark:text-zinc-200">
                  <input type="checkbox" checked={parts[part.key]} onChange={(e) => setParts({ ...parts, [part.key]: e.target.checked })} className="w-4 h-4 accent-indigo-600" />{part.label}
                </label>
              ))}
              {data.portfolioUrl && (
                <label className="flex items-center gap-2 py-0.5 text-sm text-zinc-800 dark:text-zinc-200">
                  <input type="checkbox" checked={withLink} onChange={(e) => setWithLink(e.target.checked)} className="w-4 h-4 accent-indigo-600" />The link to my portfolio
                </label>
              )}
            </fieldset>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-2">Preview</p>
            <div role="region" aria-label="CV preview" tabIndex={0} className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white text-zinc-900 p-6 sm:p-8 max-h-[60vh] overflow-auto shadow-inner">
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
