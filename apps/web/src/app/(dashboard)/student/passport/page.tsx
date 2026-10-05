'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Copy, Download, ExternalLink, Eye, FileJson, Globe2, Loader2, Lock, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, CREDENTIAL_TABS } from '@/components/layout/SectionTabs';
import Link from '@/components/ui/Link';
import { authedJson } from '@/lib/authed-fetch';
import { downloadFile as download } from '@/lib/download';
import { confirmDialog } from '@/components/ui/Dialogs';
import { PassportView, type PassportData } from '@/components/passport/PassportView';
import { cn } from '@/lib/utils';
import { QrCode } from '@/components/ui/QrCode';
import { Switch } from '@/components/ui/Switch';

interface Passport {
  isPublic: boolean; headline: string | null; url: string; views: number;
  showSkills: boolean; showCredentials: boolean; showCourses: boolean; showImpact: boolean; showEvidence: boolean;
  strengths: string | null; strengthsAt: string | null;
  preview: PassportData | null;
}

const SECTIONS = [
  { key: 'showEvidence', label: 'Skills with evidence', hint: 'Skills backed by graded work, passed quizzes and verified credentials, with your strengths paragraph' },
  { key: 'showCredentials', label: 'Verified credentials', hint: 'Signed impact credentials, each with a link to verify it' },
  { key: 'showImpact', label: 'Impact totals', hint: 'Verified hours, people reached, impact points' },
  { key: 'showSkills', label: 'Skills', hint: 'From My Skills, with endorsements' },
  { key: 'showCourses', label: 'Courses', hint: 'Course names and credits (never grades)' },
] as const;

export default function SkillsPassportPage() {
  const { data, error, mutate } = useSWR<Passport>('/api/passport', authedJson);
  const [saving, setSaving] = useState(false);
  const [headline, setHeadline] = useState<string | null>(null);
  const [strengths, setStrengths] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);

  const save = async (patch: Record<string, unknown>, done?: string) => {
    setSaving(true);
    try {
      const next = await authedJson<Passport>('/api/passport', { method: 'PATCH', body: JSON.stringify(patch) });
      await mutate(next, { revalidate: false });
      if (done) toast.success(done);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  if (error) return <><Topbar title="Credentials & passport" /><SectionTabs tabs={CREDENTIAL_TABS} /><p className="p-6 text-sm text-rose-500">{(error as Error).message}</p></>;
  if (!data) return <><Topbar title="Credentials & passport" /><SectionTabs tabs={CREDENTIAL_TABS} /><div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div></>;

  const preview: PassportData | null = data.preview && {
    ...data.preview,
    headline: headline ?? data.headline,
    credentials: data.showCredentials ? data.preview.credentials : undefined,
    impact: data.showImpact ? data.preview.impact : undefined,
    skills: data.showSkills ? data.preview.skills : undefined,
    courses: data.showCourses ? data.preview.courses : undefined,
    evidence: data.showEvidence ? data.preview.evidence : undefined,
    strengths: data.showEvidence ? (strengths ?? data.strengths) : undefined,
  };

  const draftStrengths = async () => {
    setDrafting(true);
    try {
      const r = await authedJson<{ strengths: string }>('/api/passport/strengths', { method: 'POST' });
      setStrengths(null);
      await mutate();
      toast.success('Draft written from your evidence. Edit it as you like.');
      return r;
    } catch (e) { toast.error((e as Error).message); } finally { setDrafting(false); }
  };
  const evidenceCount = data.preview?.evidence?.reduce((n, g) => n + g.count, 0) ?? 0;

  return (
    <>
      <Topbar title="Credentials & passport" subtitle="Your verified skills and impact, ready to share with employers and universities" />
      <SectionTabs tabs={CREDENTIAL_TABS} />
      <div className="p-4 md:p-8 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[22rem_minmax(0,1fr)] gap-6 items-start min-w-0 w-full">
        <aside className="space-y-4 lg:sticky lg:top-4">
          <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5">
            <div className="flex items-center gap-3">
              <span className={cn('w-10 h-10 rounded-2xl flex items-center justify-center', data.isPublic ? 'bg-emerald-500/15 text-emerald-500' : 'bg-zinc-500/10 text-zinc-500')}>{data.isPublic ? <Globe2 className="w-5 h-5" /> : <Lock className="w-5 h-5" />}</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-zinc-900 dark:text-white">{data.isPublic ? 'Public' : 'Private'}</p>
                <p className="text-xs text-zinc-500">{data.isPublic ? `Anyone with the link can see it · ${data.views} view${data.views === 1 ? '' : 's'}` : 'Only you can see it'}</p>
              </div>
              <Switch checked={data.isPublic} label="Public passport" disabled={saving} onChange={() => save({ isPublic: !data.isPublic }, data.isPublic ? 'Your passport is private again' : 'Your passport is public')} />
            </div>
            {data.isPublic && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-3 py-2">
                  <span className="flex-1 min-w-0 truncate text-xs text-zinc-700 dark:text-zinc-200">{data.url}</span>
                  <button onClick={() => { navigator.clipboard.writeText(data.url).then(() => toast.success('Link copied')); }} aria-label="Copy link" className="p-1 text-zinc-500 hover:text-indigo-500"><Copy className="w-4 h-4" /></button>
                  <a href={data.url} target="_blank" rel="noopener noreferrer" aria-label="Open public passport" className="p-1 text-zinc-500 hover:text-indigo-500"><ExternalLink className="w-4 h-4" /></a>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(data.url)}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#0a66c2] text-white">Share on LinkedIn</a>
                  <button aria-busy={saving || undefined} disabled={saving} onClick={async () => { if (await confirmDialog({ title: 'Make a new link?', message: 'The current link stops working. Use this if you shared it with someone who shouldn’t see it any more.', confirmLabel: 'New link' })) save({ resetLink: true }, 'New link created'); }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-200 inline-flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> New link</button>
                </div>
                {/* The same link as a QR code: handy on a CV, a poster or at a careers fair */}
                <div className="mt-3 flex items-center gap-3 rounded-2xl p-3 bg-gradient-to-br from-indigo-500/10 to-fuchsia-500/10 border border-indigo-500/15">
                  <div className="rounded-xl p-1 bg-gradient-to-br from-indigo-500 to-fuchsia-500 shrink-0">
                    <QrCode value={data.url} size={84} className="rounded-lg block" title="QR code for your public passport" />
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300">Scanning this opens your public passport. Add it to your CV or show it at a careers fair.</p>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-zinc-900 dark:text-white">Headline</span>
              <input value={headline ?? data.headline ?? ''} maxLength={140} onChange={(e) => setHeadline(e.target.value)} onBlur={() => headline !== null && headline !== (data.headline ?? '') && save({ headline }, 'Headline saved')}
                placeholder="e.g. CS student · climate education volunteer" className="mt-1.5 w-full rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40" />
            </label>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">What it shows</p>
              <div className="mt-2 space-y-1">
                {SECTIONS.map((s) => (
                  <label key={s.key} className="flex items-start gap-3 p-2 -mx-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/[0.03] cursor-pointer">
                    <input type="checkbox" checked={data[s.key]} disabled={saving} onChange={(e) => save({ [s.key]: e.target.checked })} className="mt-0.5 w-4 h-4 accent-indigo-500" />
                    <span><span className="block text-sm text-zinc-800 dark:text-zinc-200">{s.label}</span><span className="block text-[11px] text-zinc-500">{s.hint}</span></span>
                  </label>
                ))}
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-500">Your email, phone, grades and date of birth are never shown. Add skills in <Link href="/student/skills" className="text-indigo-500 hover:underline">My Skills</Link>; request credentials in <Link href="/student/credentials" className="text-indigo-500 hover:underline">Verified Credentials</Link>.</p>
          </section>

          <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">Strengths paragraph</p>
              <button onClick={() => void draftStrengths()} disabled={drafting || !evidenceCount} title={evidenceCount ? 'Write a draft from your evidence (one AI request)' : 'Appears once you have evidence'}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white inline-flex items-center gap-1 disabled:opacity-50">
                {drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} {data.strengths ? 'Redraft' : 'Draft with AI'}
              </button>
            </div>
            <textarea value={strengths ?? data.strengths ?? ''} maxLength={700} rows={4} onChange={(e) => setStrengths(e.target.value)}
              onBlur={() => strengths !== null && strengths !== (data.strengths ?? '') && save({ strengths }, 'Strengths saved').then(() => setStrengths(null))}
              placeholder={evidenceCount ? 'A few sentences on what your evidence shows you’re good at.' : 'Once your work is graded, AI can draft this from your evidence.'}
              className="w-full rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40" />
            <p className="text-[11px] text-zinc-500">Shown at the top of your passport with Skills with evidence. AI only uses your evidence; you can change every word.</p>
          </section>

          <section className="rounded-3xl border border-indigo-500/20 bg-indigo-500/[0.05] p-5">
            <p className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-indigo-500" /> Open Badges 3.0</p>
            {evidenceCount > 0 && (
              <div className="mt-2 mb-3 flex flex-wrap gap-2">
                <button onClick={() => download('/api/passport/skills-badge').catch((e) => toast.error(e.message))} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white inline-flex items-center gap-1"><Download className="w-3.5 h-3.5" /> Skills badge</button>
                <button onClick={() => download('/api/passport/skills-badge?format=json').catch((e) => toast.error(e.message))} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/70 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-200 inline-flex items-center gap-1"><FileJson className="w-3.5 h-3.5" /> JSON</button>
              </div>
            )}
            <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Your skills with evidence download as one signed badge. Download any verified credential as a signed Open Badge (the international standard used by Credly, Badgr / Canvas Credentials and digital wallets) and add it where you keep your achievements. Employers can check it with the public key or on your passport.</p>
          </section>
        </aside>

        <div className="min-w-0">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Preview — what others see</p>
          {preview && (
            <PassportView
              p={preview}
              onHide={(id, hidden) => void save({ hideEvidence: { id, hidden } }, hidden ? 'Hidden from your public passport' : 'Shown on your public passport again')}
              badgeActions={(id) => (
                <>
                  <button onClick={() => download(`/api/passport/badge/${id}`).catch((e) => toast.error(e.message))} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1 hover:underline"><Download className="w-3 h-3" /> Open Badge</button>
                  <button onClick={() => download(`/api/passport/badge/${id}?format=json`).catch((e) => toast.error(e.message))} className="text-xs font-semibold text-zinc-500 inline-flex items-center gap-1 hover:underline"><FileJson className="w-3 h-3" /> JSON</button>
                </>
              )}
            />
          )}
        </div>
      </div>
    </>
  );
}
