'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { authedJson } from '@/lib/authed-fetch';
import {
  Database,
  Layers,
  Download,
  Plus,
  X,
  Play,
  Lock,
  Loader2,
  BarChart3,
  Activity,
  Copy,
  Check,
} from 'lucide-react';

export interface XApiStatementRecord {
  id: string;
  actorId: string;
  actorType: string;
  verb: string;
  objectType: string;
  objectId: string;
  objectName: string | null;
  resultScore: number | null;
  resultSuccess: boolean | null;
  resultCompletion: boolean | null;
  durationSeconds: number | null;
  contextCourseId: string | null;
  contextCourse?: { id: string; code: string; name: string } | null;
  timestamp: string;
}

export interface AnalyticsExportRecord {
  id: string;
  periodStart: string;
  periodEnd: string;
  format: string;
  anonymized: boolean;
  status: string;
  recordCount: number;
  fileSizeBytes: number;
  sha256Hash: string | null;
  createdAt: string;
  generatedBy?: { id: string; name: string; email: string };
}

export interface ResearchRequestRecord {
  id: string;
  title: string;
  institution: string;
  purpose: string;
  datasetScope: string;
  anonymized: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string | null;
  expiresAt?: string | null;
  accessToken?: string | null;
  createdAt: string;
  requestedBy?: { id: string; name: string; email: string };
}

export interface TermComparisonResponse {
  organizationId: string;
  totalWarehouseStatements: number;
  terms: {
    term: string;
    period: string;
    activeStudents: number;
    averageGpa: number;
    retentionRatePct: number;
    averageMasteryPct: number;
    learningHoursTotal: number;
    courseCompletionRatePct: number;
  }[];
  verbDistribution: Record<string, number>;
}

export function AnalyticsWarehousePanel() {
  const [activeTab, setActiveTab] = useState<'terms' | 'stream' | 'export' | 'research'>('terms');

  // Stream Tab state
  const [selectedVerb, setSelectedVerb] = useState<string>('all');
  const [isEmittingTest, setIsEmittingTest] = useState(false);

  // Export Tab state
  const [exportStart, setExportStart] = useState<string>('2026-08-01');
  const [exportEnd, setExportEnd] = useState<string>('2026-10-12');
  const [exportFormat, setExportFormat] = useState<'CSV' | 'JSON'>('CSV');
  const [anonymizeExport, setAnonymizeExport] = useState(true);
  const [isGeneratingExport, setIsGeneratingExport] = useState(false);
  const [downloadPreview, setDownloadPreview] = useState<{ filename: string; content: string } | null>(null);

  // Research Tab state
  const [showResearchModal, setShowResearchModal] = useState(false);
  const [researchForm, setResearchForm] = useState({
    title: '',
    institution: '',
    purpose: '',
    datasetScope: 'LEARNING_OUTCOMES',
    anonymized: true,
  });
  const [isSubmittingResearch, setIsSubmittingResearch] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // SWR Hooks
  const { data: termData, isLoading: loadingTerms } = useSWR<TermComparisonResponse>(
    '/api/analytics/warehouse/terms',
    authedJson
  );

  const { data: streamData, isLoading: loadingStream, mutate: refreshStream } = useSWR<{
    statements: XApiStatementRecord[];
    total: number;
  }>(
    activeTab === 'stream'
      ? `/api/analytics/xapi?${selectedVerb !== 'all' ? `verb=${selectedVerb}&` : ''}limit=40`
      : null,
    authedJson,
    { refreshInterval: 5000 }
  );

  const { data: exportsList = [], isLoading: loadingExports, mutate: refreshExports } = useSWR<
    AnalyticsExportRecord[]
  >(activeTab === 'export' ? '/api/analytics/warehouse/export' : null, authedJson);

  const { data: researchList = [], isLoading: loadingResearch, mutate: refreshResearch } = useSWR<
    ResearchRequestRecord[]
  >(activeTab === 'research' ? '/api/analytics/warehouse/research' : null, authedJson);

  // Emit Test Statement Handler
  async function handleEmitTestStatement() {
    setIsEmittingTest(true);
    try {
      await authedJson('/api/analytics/xapi', {
        method: 'POST',
        body: JSON.stringify({
          verb: 'completed',
          objectType: 'assignment',
          objectId: 'test_asgn_402',
          objectName: 'Distributed Systems Raft Lab',
          resultScore: 98,
          resultSuccess: true,
          resultCompletion: true,
          durationSeconds: 1450,
        }),
      });
      toast.success('Emitted test xAPI statement: completed "Distributed Systems Raft Lab" (score: 98%)');
      refreshStream();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to emit statement';
      toast.error(msg);
    } finally {
      setIsEmittingTest(false);
    }
  }

  // Generate Warehouse Export Handler
  async function handleGenerateExport(e: React.FormEvent) {
    e.preventDefault();
    setIsGeneratingExport(true);
    try {
      const res = await authedJson<{
        exportRecord: AnalyticsExportRecord;
        fileContent: string;
        recordCount: number;
        sha256Hash: string;
      }>('/api/analytics/warehouse/export', {
        method: 'POST',
        body: JSON.stringify({
          periodStart: exportStart,
          periodEnd: exportEnd,
          format: exportFormat,
          anonymized: anonymizeExport,
        }),
      });

      toast.success(`Generated warehouse export (${res.recordCount} records, format: ${exportFormat})`);
      setDownloadPreview({
        filename: `universe-warehouse-export-${Date.now()}.${exportFormat.toLowerCase()}`,
        content: res.fileContent,
      });
      refreshExports();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate export';
      toast.error(msg);
    } finally {
      setIsGeneratingExport(false);
    }
  }

  // Trigger Client-side File Download
  function downloadBlob(filename: string, content: string) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${filename}`);
  }

  // Research Request Submit
  async function handleResearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!researchForm.title || !researchForm.institution || !researchForm.purpose) {
      toast.error('Please complete all required fields');
      return;
    }
    setIsSubmittingResearch(true);
    try {
      await authedJson('/api/analytics/warehouse/research', {
        method: 'POST',
        body: JSON.stringify(researchForm),
      });
      toast.success('Research data request submitted for institutional review.');
      setShowResearchModal(false);
      setResearchForm({
        title: '',
        institution: '',
        purpose: '',
        datasetScope: 'LEARNING_OUTCOMES',
        anonymized: true,
      });
      refreshResearch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit request';
      toast.error(msg);
    } finally {
      setIsSubmittingResearch(false);
    }
  }

  // Review Research Request
  async function handleReviewResearch(id: string, status: 'APPROVED' | 'REJECTED') {
    try {
      await authedJson(`/api/analytics/warehouse/research/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status, validityDays: 90 }),
      });
      toast.success(`Research data request marked as ${status}.`);
      refreshResearch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to review request';
      toast.error(msg);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-indigo-200/50 dark:border-indigo-900/40 bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/40 dark:from-indigo-950/20 dark:via-zinc-900 dark:to-purple-950/10 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 dark:border-indigo-800/60 bg-indigo-500/10 px-3 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              <Database className="h-3.5 w-3.5" />
              Stage 5 · C8 Learning Analytics Warehouse & xAPI
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
              Learning Analytics Warehouse
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Anonymized learning event warehousing, xAPI interaction stream, term cohort comparisons, and governed academic research data exchange.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleEmitTestStatement}
              disabled={isEmittingTest}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 shadow-sm transition-colors"
            >
              {isEmittingTest ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 text-indigo-600" />}
              Emit xAPI Event
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('export')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-500 shadow-sm transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Warehouse Export
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mt-6 flex items-center gap-2 border-t border-zinc-200/60 dark:border-zinc-800/60 pt-4 overflow-x-auto scrollbar-thin">
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'terms'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            Term Comparisons
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('stream')}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'stream'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Activity className="h-4 w-4" />
            Live xAPI Telemetry
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'export'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Layers className="h-4 w-4" />
            Warehouse Exports
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('research')}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'research'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Lock className="h-4 w-4" />
            Academic Research Governance
          </button>
        </div>
      </div>

      {/* Tab 1: Term Comparisons */}
      {activeTab === 'terms' && (
        <div className="space-y-6">
          {loadingTerms ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : !termData ? (
            <div className="text-center py-8 text-zinc-500">Failed to load term comparisons.</div>
          ) : (
            <>
              {/* Cohort Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {termData.terms.map((t, idx) => (
                  <div
                    key={t.term}
                    className={`rounded-2xl border p-5 shadow-sm transition-all ${
                      idx === 0
                        ? 'border-indigo-300 dark:border-indigo-800/80 bg-white dark:bg-zinc-900 shadow-md ring-1 ring-indigo-500/10'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                        {t.term} {idx === 0 && '· Active Term'}
                      </span>
                      <span className="text-xs text-zinc-500">{t.period}</span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-zinc-500">Average GPA</div>
                        <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{t.averageGpa.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500">Retention</div>
                        <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{t.retentionRatePct}%</div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500">Mastery Score</div>
                        <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{t.averageMasteryPct}%</div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500">Completion</div>
                        <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{t.courseCompletionRatePct}%</div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500 flex items-center justify-between">
                      <span>{t.activeStudents.toLocaleString()} Enrolled</span>
                      <span>{t.learningHoursTotal.toLocaleString()} Learning Hours</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Learning Activity Verb Distribution */}
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                      xAPI Interaction Verb Distribution
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Activity breakdown across standard 1EdTech / ADL xAPI learning verbs.
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    {termData.totalWarehouseStatements} Total Recorded Events
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
                  {Object.entries(termData.verbDistribution).map(([verb, count]) => (
                    <div
                      key={verb}
                      className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40 p-3.5 text-center"
                    >
                      <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{verb}</div>
                      <div className="text-lg font-extrabold text-zinc-900 dark:text-zinc-100 mt-1">
                        {count.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">statements</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab 2: Live xAPI Telemetry */}
      {activeTab === 'stream' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">Filter Verb:</span>
              <select
                value={selectedVerb}
                onChange={(e) => setSelectedVerb(e.target.value)}
                className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Verbs</option>
                <option value="completed">completed</option>
                <option value="attempted">attempted</option>
                <option value="passed">passed</option>
                <option value="failed">failed</option>
                <option value="interacted">interacted</option>
                <option value="mastered">mastered</option>
                <option value="experienced">experienced</option>
              </select>
            </div>

            <div className="text-xs text-zinc-500 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Stream (Auto-refreshes every 5s)
            </div>
          </div>

          {loadingStream ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : !streamData?.statements || streamData.statements.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 p-12 text-center bg-zinc-50/50 dark:bg-zinc-900/50">
              <Activity className="mx-auto h-12 w-12 text-zinc-400" />
              <h3 className="mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">No xAPI statements found</h3>
              <p className="mt-1 text-sm text-zinc-500 max-w-sm mx-auto">
                No events recorded yet. Emit a test xAPI statement above to observe the live stream.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800">
              {streamData.statements.map((stmt) => (
                <div key={stmt.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                        {stmt.verb.toUpperCase()}
                      </span>
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {stmt.objectName || `${stmt.objectType}:${stmt.objectId}`}
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        ({stmt.objectType})
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 flex items-center gap-3">
                      <span>Actor: <code className="text-[11px] text-zinc-700 dark:text-zinc-300">{stmt.actorId}</code></span>
                      {stmt.contextCourse && (
                        <span>Course: [{stmt.contextCourse.code}] {stmt.contextCourse.name}</span>
                      )}
                      {stmt.resultScore !== null && (
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          Score: {stmt.resultScore}%
                        </span>
                      )}
                      {stmt.durationSeconds !== null && (
                        <span>Duration: {Math.round(stmt.durationSeconds)}s</span>
                      )}
                    </div>
                  </div>

                  <div className="text-[11px] text-zinc-400 shrink-0">
                    {new Date(stmt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Warehouse Exports */}
      {activeTab === 'export' && (
        <div className="space-y-6">
          {/* Export Form */}
          <form
            onSubmit={handleGenerateExport}
            className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm space-y-4"
          >
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Generate Anonymized Learning Warehouse Export
              </h3>
              <p className="text-xs text-zinc-500">
                Aggregates interaction events, completion states, and performance metrics. Compliant with FERPA 34 CFR Part 99 and DPDP Act 2023.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Period Start</label>
                <input
                  type="date"
                  value={exportStart}
                  onChange={(e) => setExportStart(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Period End</label>
                <input
                  type="date"
                  value={exportEnd}
                  onChange={(e) => setExportEnd(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">File Format</label>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as 'CSV' | 'JSON')}
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="CSV">CSV (Standard Tabular)</option>
                  <option value="JSON">JSON (Raw Statement Stream)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Privacy Safeguards</label>
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="anonymize"
                    checked={anonymizeExport}
                    onChange={(e) => setAnonymizeExport(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="anonymize" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Synthetic IDs (syn_usr_...)
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <span className="text-[11px] text-zinc-500">
                Exports generate cryptographic SHA-256 tamper-evident verification checksums.
              </span>
              <button
                type="submit"
                disabled={isGeneratingExport}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 shadow-sm disabled:opacity-50"
              >
                {isGeneratingExport && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Generate Warehouse Export
              </button>
            </div>
          </form>

          {/* Download Preview Alert */}
          {downloadPreview && (
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  Export Ready: {downloadPreview.filename}
                </div>
                <div className="text-xs text-emerald-700 dark:text-emerald-300">
                  Calculated payload integrity hash and verified non-PII compliance.
                </div>
              </div>
              <button
                type="button"
                onClick={() => downloadBlob(downloadPreview.filename, downloadPreview.content)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 shadow-sm"
              >
                <Download className="h-3.5 w-3.5" />
                Download File
              </button>
            </div>
          )}

          {/* Previous Exports History */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              Previous Warehouse Exports History
            </h4>

            {loadingExports ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              </div>
            ) : exportsList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 p-8 text-center text-xs text-zinc-500">
                No exports generated yet.
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                {exportsList.map((exp) => (
                  <div key={exp.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                          {exp.format} Export ({exp.recordCount} records)
                        </span>
                        <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:text-zinc-400">
                          {exp.anonymized ? 'ANONYMIZED' : 'FULL'}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500">
                        Period: {new Date(exp.periodStart).toLocaleDateString()} – {new Date(exp.periodEnd).toLocaleDateString()} · Size: {Math.round(exp.fileSizeBytes / 1024)} KB
                      </div>
                      {exp.sha256Hash && (
                        <div className="text-[10px] text-zinc-400 font-mono truncate max-w-md">
                          SHA-256: {exp.sha256Hash}
                        </div>
                      )}
                    </div>

                    <span className="text-xs text-zinc-400">
                      {new Date(exp.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Academic Research Governance */}
      {activeTab === 'research' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Academic Research Data Requests
              </h3>
              <p className="text-xs text-zinc-500">
                Governed research access requests from universities and academic partners with time-bounded tokens.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowResearchModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-500 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              New Research Request
            </button>
          </div>

          {loadingResearch ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : researchList.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 p-12 text-center bg-zinc-50/50 dark:bg-zinc-900/50">
              <Lock className="mx-auto h-12 w-12 text-zinc-400" />
              <h3 className="mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">No active research requests</h3>
              <p className="mt-1 text-sm text-zinc-500 max-w-sm mx-auto">
                Submit an academic research proposal to obtain an anonymized learning telemetry dataset.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {researchList.map((req) => (
                <div
                  key={req.id}
                  className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-lg px-2 py-0.5 text-xs font-bold ${
                            req.status === 'APPROVED'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40'
                              : req.status === 'REJECTED'
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40'
                          }`}
                        >
                          {req.status}
                        </span>
                        <h4 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                          {req.title}
                        </h4>
                      </div>
                      <div className="text-xs text-zinc-500">
                        {req.institution} · Submitted by {req.requestedBy?.name || 'Researcher'} ({req.requestedBy?.email})
                      </div>
                    </div>

                    {req.status === 'PENDING' && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleReviewResearch(req.id, 'APPROVED')}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReviewResearch(req.id, 'REJECTED')}
                          className="rounded-lg border border-rose-200 dark:border-rose-800 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed bg-zinc-50 dark:bg-zinc-800/40 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800/80">
                    {req.purpose}
                  </p>

                  {req.accessToken && (
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 p-3 text-xs font-mono">
                      <div className="truncate">
                        <span className="text-zinc-500 select-none">Token: </span>
                        <span className="text-indigo-600 dark:text-indigo-400 font-bold">{req.accessToken}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(req.accessToken || '');
                          setCopiedToken(req.id);
                          toast.success('Access token copied to clipboard');
                          setTimeout(() => setCopiedToken(null), 2000);
                        }}
                        className="rounded p-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                      >
                        {copiedToken === req.id ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Research Request Modal */}
      {showResearchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  Submit Academic Research Proposal
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Request governed access to anonymized learning telemetry.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowResearchModal(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleResearchSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Research Project Title *</label>
                <input
                  type="text"
                  required
                  value={researchForm.title}
                  onChange={(e) => setResearchForm({ ...researchForm, title: e.target.value })}
                  placeholder="e.g. Cognitive Load Assessment in Computer Science Syllabi"
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">University / Institution *</label>
                <input
                  type="text"
                  required
                  value={researchForm.institution}
                  onChange={(e) => setResearchForm({ ...researchForm, institution: e.target.value })}
                  placeholder="e.g. Stanford University School of Education"
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Purpose & Methodology Statement *</label>
                <textarea
                  rows={3}
                  required
                  value={researchForm.purpose}
                  onChange={(e) => setResearchForm({ ...researchForm, purpose: e.target.value })}
                  placeholder="Describe your research hypotheses, data handling protocols, and publication goals..."
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowResearchModal(false)}
                  className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingResearch}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 shadow-sm disabled:opacity-50"
                >
                  {isSubmittingResearch && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Submit Proposal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
