'use client';

import { useState } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, Loader2, Sparkles, Users, HeartHandshake, Wand2, Copy } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { PremiumGate } from '@/components/billing/PremiumGate';
import { authedFetch, authedJson } from '@/lib/authed-fetch';

const EXPORTS = [
  { type: 'members', title: 'Members', desc: 'Every account with role, status, impact level and join date.', icon: Users },
  { type: 'impact', title: 'Impact points ledger', desc: 'Every impact award: who, how many points, and why.', icon: Sparkles },
  { type: 'applications', title: 'NGO applications', desc: 'Student applications to NGO projects with their status.', icon: HeartHandshake },
] as const;

function Exports() {
  const [busy, setBusy] = useState<string | null>(null);

  const download = async (type: string) => {
    setBusy(type);
    try {
      const res = await authedFetch(`/api/premium/export?type=${type}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Export failed');
      const blob = await res.blob();
      const name = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? `universe-${type}.csv`;
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${name} downloaded`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {EXPORTS.map((e, i) => (
        <motion.button
          key={e.type}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i, 6) * 0.03 }}
          whileHover={{ y: -4 }}
          onClick={() => download(e.type)}
          disabled={busy !== null}
          className="group text-left rounded-3xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/50 p-6 hover:border-indigo-500/40 transition-colors disabled:opacity-70"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
              <e.icon className="w-5 h-5 text-indigo-500" />
            </div>
            {busy === e.type ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" /> : <Download className="w-4 h-4 text-zinc-400 group-hover:text-indigo-500 transition-colors" />}
          </div>
          <h4 className="font-bold text-zinc-900 dark:text-white">{e.title}</h4>
          <p className="text-sm text-zinc-500 mt-1">{e.desc}</p>
          <span className="inline-flex items-center gap-1 mt-4 text-[11px] font-bold text-zinc-400"><FileSpreadsheet className="w-3.5 h-3.5" /> CSV · opens in Excel & Sheets</span>
        </motion.button>
      ))}
    </div>
  );
}

// Minimal Markdown rendering for the AI report: headings, bullets, bold, paragraphs.
function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i} className="text-zinc-900 dark:text-white">{part.slice(2, -2)}</strong> : part,
  );
}

function ReportBody({ markdown }: { markdown: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(<ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-1.5 mb-4">{list.map((l, i) => <li key={i}>{renderInline(l)}</li>)}</ul>);
      list = [];
    }
  };
  markdown.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (/^[-*•]\s+/.test(line)) return void list.push(line.replace(/^[-*•]\s+/, ''));
    flush();
    if (!line) return;
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) blocks.push(<h3 key={i} className="text-lg font-black text-zinc-900 dark:text-white mt-6 mb-2 first:mt-0">{h[2].replace(/\*\*/g, '')}</h3>);
    else blocks.push(<p key={i} className="mb-3 leading-relaxed">{renderInline(line)}</p>);
  });
  flush();
  return <div className="text-sm text-zinc-600 dark:text-zinc-300">{blocks}</div>;
}

function AiReport() {
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const { report } = await authedJson<{ report: string }>('/api/premium/ai-report', { method: 'POST' });
      setReport(report);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadMd = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([report], { type: 'text/markdown' }));
    Object.assign(document.createElement('a'), { href: url, download: `impact-report-${new Date().toISOString().slice(0, 10)}.md` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-fuchsia-500/20 bg-gradient-to-br from-white via-white to-fuchsia-50 dark:from-zinc-900/70 dark:via-zinc-900/60 dark:to-fuchsia-950/20 p-6 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-xl font-black text-zinc-900 dark:text-white flex items-center gap-2"><Wand2 className="w-5 h-5 text-fuchsia-500" /> AI Executive Impact Report</h3>
          <p className="text-sm text-zinc-500 mt-1">A board-ready summary written from your live platform data. It only uses real figures.</p>
        </div>
        <div className="flex gap-2">
          {report && (
            <>
              <button onClick={() => { navigator.clipboard.writeText(report); toast.success('Copied'); }} className="h-11 w-11 rounded-full border border-zinc-200 dark:border-white/10 inline-flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-white/5" aria-label="Copy report"><Copy className="w-4 h-4" /></button>
              <button onClick={downloadMd} className="h-11 w-11 rounded-full border border-zinc-200 dark:border-white/10 inline-flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-white/5" aria-label="Download report"><Download className="w-4 h-4" /></button>
            </>
          )}
          <button
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white font-bold text-sm shadow-lg shadow-fuchsia-500/20 hover:opacity-95 disabled:opacity-70"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {report ? 'Regenerate' : 'Generate report'}
          </button>
        </div>
      </div>
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            {[90, 75, 82, 60, 70].map((w, i) => <div key={i} className="h-3 rounded-full bg-zinc-200/70 dark:bg-white/[0.06] animate-pulse" style={{ width: `${w}%` }} />)}
          </motion.div>
        ) : report ? (
          <motion.div key="report" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-white/70 dark:bg-black/20 border border-zinc-200/70 dark:border-white/[0.05] p-6">
            <ReportBody markdown={report} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <>
      <Topbar title="Reports & Exports" subtitle="Take your organization's data anywhere" />
      <div className="flex-1 overflow-y-auto flex flex-col">
        <section className="px-4 md:px-8 pt-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Data exports · Pro</h2>
        </section>
        <PremiumGate feature="data_exports">
          <div className="px-4 md:px-8"><Exports /></div>
        </PremiumGate>
        <section className="px-4 md:px-8 pt-10">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">AI reporting · Enterprise</h2>
        </section>
        <PremiumGate feature="ai_impact_reports">
          <div className="px-4 md:px-8 pb-10"><AiReport /></div>
        </PremiumGate>
      </div>
    </>
  );
}
