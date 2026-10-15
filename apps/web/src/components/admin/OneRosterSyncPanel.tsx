'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { authedJson } from '@/lib/authed-fetch';
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Layers,
  Users,
  BookOpen,
  Globe2,
  Copy,
  Clock,
} from 'lucide-react';
import type { OneRosterPreviewResult } from '@/server/oneroster';

interface SyncHistoryItem {
  id: string;
  syncType: string;
  status: string;
  summary: string;
  coursesCount: number;
  classesCount: number;
  usersCount: number;
  enrollmentsCount: number;
  createdAt: string;
  actor?: { name: string | null; email: string | null };
}

export function OneRosterSyncPanel() {
  const [filesMap, setFilesMap] = useState<Record<string, string>>({});
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [preview, setPreview] = useState<OneRosterPreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'courses' | 'enrollments'>('users');

  const { data: history, mutate: mutateHistory } = useSWR<SyncHistoryItem[]>(
    '/api/admin/oneroster/history',
    authedJson,
  );

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const map: Record<string, string> = {};
    const names: string[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (!f.name.toLowerCase().endsWith('.csv')) continue;
      try {
        const text = await f.text();
        map[f.name.toLowerCase()] = text;
        names.push(f.name);
      } catch {
        toast.error(`Could not read ${f.name}`);
      }
    }

    if (names.length === 0) {
      toast.error('Please select valid OneRoster .csv files (e.g. users.csv, classes.csv, enrollments.csv).');
      return;
    }

    setFilesMap(map);
    setFileNames(names);
    setPreview(null);

    // Auto-run preview
    setPreviewing(true);
    try {
      const res = await authedJson<OneRosterPreviewResult>('/api/admin/oneroster/preview', {
        method: 'POST',
        body: JSON.stringify({ files: map }),
      });
      setPreview(res);
      toast.success(`Parsed ${names.length} OneRoster tables successfully.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to preview OneRoster data';
      toast.error(message);
    } finally {
      setPreviewing(false);
    }
  };

  const executeSync = async () => {
    if (Object.keys(filesMap).length === 0) return;
    setSyncing(true);
    try {
      const res = await authedJson<{ status: string; summary: string }>('/api/admin/oneroster/sync', {
        method: 'POST',
        body: JSON.stringify({ files: filesMap }),
      });
      toast.success(res.summary || 'OneRoster sync completed successfully!');
      setFilesMap({});
      setFileNames([]);
      setPreview(null);
      await mutateHistory();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sync execution failed';
      toast.error(message);
    } finally {
      setSyncing(false);
    }
  };

  const copyUrl = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => toast.success('Copied to clipboard'));
  };

  return (
    <div className="space-y-8">
      {/* ── Hero Info ── */}
      <div className="p-6 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-xl shadow-xl flex flex-col md:flex-row items-start justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-bold text-indigo-600 dark:text-indigo-400">
            <Layers className="w-3.5 h-3.5" /> 1EdTech OneRoster 1.2 SIS Integration
          </div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
            Student Information System (SIS) Roster Sync
          </h2>
          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Automatically synchronize students, faculty, academic courses, and class enrollments from PowerSchool, Infinite Campus, Blackbaud, or any standard OneRoster 1.2 CSV export.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <label className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm cursor-pointer shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2">
            <UploadCloud className="w-4 h-4" /> Select OneRoster CSVs
            <input
              type="file"
              multiple
              accept=".csv"
              className="hidden"
              onChange={(e) => void handleFiles(e.target.files)}
            />
          </label>
        </div>
      </div>

      {/* ── Selected Files Bar ── */}
      {fileNames.length > 0 && (
        <div className="p-4 rounded-2xl border border-indigo-500/20 bg-indigo-50/50 dark:bg-indigo-950/20 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-indigo-950 dark:text-indigo-200">
              Loaded {fileNames.length} table{fileNames.length === 1 ? '' : 's'}:
            </span>
            {fileNames.map((name) => (
              <span
                key={name}
                className="px-2.5 py-1 rounded-xl bg-white dark:bg-zinc-900 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 font-mono text-[11px]"
              >
                {name}
              </span>
            ))}
          </div>

          <button
            onClick={() => {
              setFilesMap({});
              setFileNames([]);
              setPreview(null);
            }}
            className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 font-medium"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* ── Preview Loading State ── */}
      {previewing && (
        <div className="p-12 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">Analyzing OneRoster schema & foreign keys...</p>
          <p className="text-xs text-zinc-500">Checking existing student emails, course codes, and roster memberships</p>
        </div>
      )}

      {/* ── Dry-run Preview Card ── */}
      {preview && !previewing && (
        <div className="p-6 sm:p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800">
            <div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" /> OneRoster Dry-Run Analysis
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">{preview.summary}</p>
            </div>

            <button
              onClick={() => void executeSync()}
              disabled={syncing}
              className="px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2"
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Execute Roster Sync
            </button>
          </div>

          {/* Counts Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span className="font-semibold flex items-center gap-1.5"><Users className="w-4 h-4 text-indigo-500" /> Users</span>
                <span>{preview.counts.usersTotal} total</span>
              </div>
              <p className="text-2xl font-black text-zinc-900 dark:text-white">
                +{preview.counts.usersToCreate}{' '}
                <span className="text-xs font-normal text-zinc-500">({preview.counts.usersExisting} matched)</span>
              </p>
            </div>

            <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span className="font-semibold flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-purple-500" /> Courses & Classes</span>
                <span>{preview.counts.coursesTotal} total</span>
              </div>
              <p className="text-2xl font-black text-zinc-900 dark:text-white">
                +{preview.counts.coursesToCreate}{' '}
                <span className="text-xs font-normal text-zinc-500">({preview.counts.coursesExisting} matched)</span>
              </p>
            </div>

            <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span className="font-semibold flex items-center gap-1.5"><Layers className="w-4 h-4 text-emerald-500" /> Enrollments</span>
                <span>{preview.counts.enrollmentsTotal} total</span>
              </div>
              <p className="text-2xl font-black text-zinc-900 dark:text-white">
                {preview.counts.enrollmentsToCreate}{' '}
                <span className="text-xs font-normal text-zinc-500">roster links</span>
              </p>
            </div>
          </div>

          {/* Warnings */}
          {preview.warnings.length > 0 && (
            <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 space-y-1 text-xs text-amber-800 dark:text-amber-200">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Validation Notices ({preview.warnings.length})
              </div>
              <ul className="list-disc pl-5 space-y-0.5 pt-1">
                {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {/* Item Inspector Tabs */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2">
              {[
                { id: 'users', label: 'Users Preview' },
                { id: 'courses', label: 'Courses Preview' },
                { id: 'enrollments', label: 'Enrollments Preview' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    activeTab === tab.id
                      ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/50 text-xs">
              {preview.items
                .filter((it) => it.type.toLowerCase().startsWith(activeTab.slice(0, 4)))
                .slice(0, 50)
                .map((it, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between gap-4">
                    <div>
                      <span className="font-semibold text-zinc-900 dark:text-white">{it.label}</span>
                      <span className="text-[11px] text-zinc-500 block">{it.detail}</span>
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        it.action === 'create'
                          ? 'bg-indigo-500/10 text-indigo-500'
                          : it.action === 'enrol'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : 'bg-zinc-500/10 text-zinc-500'
                      }`}
                    >
                      {it.action}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Sync History ── */}
      <div className="p-6 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-xl shadow-xl space-y-4">
        <h3 className="font-bold text-base text-zinc-900 dark:text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-500" /> Recent Roster Synchronizations
        </h3>

        {!history || history.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
            No previous OneRoster synchronizations on record. Upload CSVs above to begin.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3 font-semibold">Date</th>
                  <th className="py-3 px-3 font-semibold">Status</th>
                  <th className="py-3 px-3 font-semibold">Summary</th>
                  <th className="py-3 px-3 font-semibold">Users</th>
                  <th className="py-3 px-3 font-semibold">Classes</th>
                  <th className="py-3 px-3 font-semibold">Operator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-zinc-700 dark:text-zinc-300">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="py-3 px-3 font-medium whitespace-nowrap">
                      {new Date(h.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500">
                        {h.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 max-w-xs truncate">{h.summary}</td>
                    <td className="py-3 px-3 font-mono">+{h.usersCount}</td>
                    <td className="py-3 px-3 font-mono">+{h.classesCount}</td>
                    <td className="py-3 px-3 text-zinc-500">{h.actor?.name || 'Administrator'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 1EdTech Outbound REST API Card ── */}
      <div className="p-6 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-xl shadow-xl space-y-4">
        <div>
          <h3 className="font-bold text-base text-zinc-900 dark:text-white flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-indigo-500" /> Outbound OneRoster 1.2 REST Endpoints
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            External SIS and reporting platforms can consume live roster data using standard 1EdTech REST specifications.
            Each request needs an API key from <strong>Developer</strong> (<code>Authorization: Bearer uv_live_…</code>): <code>courses.read</code> for orgs, courses and classes, <code>students.read</code> for users and enrollments. Answers hold your school’s data only.
          </p>
        </div>

        <div className="space-y-2 text-xs">
          {[
            { label: 'Orgs Endpoint', path: '/api/oneroster/v1p2/orgs' },
            { label: 'Courses Endpoint', path: '/api/oneroster/v1p2/courses' },
            { label: 'Classes Endpoint', path: '/api/oneroster/v1p2/classes' },
            { label: 'Users Endpoint', path: '/api/oneroster/v1p2/users' },
            { label: 'Enrollments Endpoint', path: '/api/oneroster/v1p2/enrollments' },
          ].map((ep) => (
            <div
              key={ep.path}
              className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 flex items-center justify-between gap-3 font-mono"
            >
              <div>
                <span className="text-[11px] text-zinc-400 font-sans block">{ep.label}</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{ep.path}</span>
              </div>
              <button
                type="button"
                onClick={() => copyUrl(window.location.origin + ep.path)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title="Copy Full URL"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
