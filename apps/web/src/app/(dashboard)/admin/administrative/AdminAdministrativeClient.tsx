'use client';
import { Topbar } from '@/components/layout/Topbar';
import { FileText, CreditCard, GraduationCap, Plus, Edit2, Trash2, X, ExternalLink, ChevronDown, Users, Loader2 } from 'lucide-react';
import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { format } from 'date-fns';
import { toast } from 'sonner';
import Link from '@/components/ui/Link';
import { api } from '@/lib/api';
import { getAuthToken } from '@/lib/auth-token';
import { isSampleMode } from '@/lib/sample-mode';
import { safeHref } from '@/lib/safe-href';
import { useAuthStore } from '@/store/auth';
import { getTransactions } from '@/app/actions/transaction';
import { AdminSearch, PersonCell, matchesQuery, personText, type PersonInfo } from '@/components/admin/AdminPeople';
import { TabPill } from '@/components/ui/Glide';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';

const TABS = [
  { id: 'documents', label: 'School Documents', icon: FileText },
  { id: 'billing', label: 'Billing & Accounting', icon: CreditCard },
  { id: 'scholarships', label: 'Scholarships', icon: GraduationCap },
] as const;
type TabId = (typeof TABS)[number]['id'];

const DOC_TYPES = ['TRANSCRIPT', 'DIPLOMA', 'CERTIFICATE', 'ID_CARD', 'LETTER', 'OTHER'] as const;
const APP_STATUSES = ['PENDING', 'REVIEWING', 'ACCEPTED', 'REJECTED'] as const;

type StudentPerson = PersonInfo & { studentProfile?: { department: string | null; year: number; gpa: number } | null };
interface Doc {
  id: string; title: string; type: string; fileUrl?: string | null; issuedAt?: string | null; expiresAt?: string | null;
  isVerified?: boolean; createdAt?: string; user?: StudentPerson | null;
}
interface Applicant { id: string; status: string; appliedAt: string; student: StudentPerson }
interface Scholarship {
  id: string; name: string; description?: string | null; amount?: number | null; currency?: string; provider?: string | null;
  deadline?: string | null; isActive: boolean; _count?: { applications: number }; applications?: Applicant[];
}
interface Payment { id: string; description: string; amount: number; currency?: string; status: string; type?: string; createdAt: string | Date; user?: PersonInfo | null }

type DocForm = { title: string; type: string; fileUrl: string; issuedAt: string };
type ScholarshipForm = { name: string; amount: string; deadline: string; provider: string; description: string };

const label = 'text-sm font-medium text-zinc-600 dark:text-zinc-400';
const card = 'bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden';
const fmtDate = (v?: string | Date | null) => (v ? format(new Date(v), 'd MMM yyyy') : '—');
const money = (n?: number | null, currency = 'USD') =>
  n == null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
const humanize = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '');

function studentFacts(p?: StudentPerson | null) {
  const sp = p?.studentProfile;
  if (!sp) return null;
  return [sp.department, sp.year ? `Year ${sp.year}` : null, sp.gpa > 0 ? `GPA ${sp.gpa.toFixed(2)}` : null].filter(Boolean).join(' · ') || null;
}

function Pill({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'zinc' | 'indigo'; children: React.ReactNode }) {
  const tones = {
    green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    red: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    zinc: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  };
  return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

const statusTone = (s: string): 'green' | 'amber' | 'red' | 'zinc' | 'indigo' =>
  s === 'ACCEPTED' || s === 'COMPLETED' ? 'green' : s === 'PENDING' ? 'amber' : s === 'REVIEWING' ? 'indigo' : s === 'WITHDRAWN' ? 'zinc' : 'red';

async function loadAll() {
  const [docsRes, schRes] = await Promise.all([
    api.get<Doc[]>('/documents').catch(() => ({ data: [] as Doc[] })),
    // Admin view with applicants; falls back to the public list if it's unavailable.
    (isSampleMode() ? Promise.reject(new Error('sample')) : api.get<Scholarship[]>('/scholarships/admin'))
      .catch(() => api.get<Scholarship[]>('/scholarships').catch(() => ({ data: [] as Scholarship[] }))),
  ]);
  let payments: Payment[] = [];
  let paymentsError: string | null = null;
  try {
    payments = (isSampleMode() ? (await import('@/lib/sample/router')).sampleTransactions() : await getTransactions(await getAuthToken())) as Payment[];
  } catch {
    paymentsError = 'Could not load payments.';
  }
  return {
    docs: Array.isArray(docsRes.data) ? docsRes.data : [],
    scholarships: Array.isArray(schRes.data) ? schRes.data : [],
    payments,
    paymentsError,
  };
}

export default function AdminAdministrativeClient() {
  const me = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<TabId>('documents');
  const [q, setQ] = useState('');
  const { data, isLoading: loading, mutate } = useSWR('admin-administrative', loadAll);
  const docs = useMemo(() => data?.docs ?? [], [data]);
  const scholarships = useMemo(() => data?.scholarships ?? [], [data]);
  const payments = useMemo(() => data?.payments ?? [], [data]);
  const paymentsError = data?.paymentsError ?? null;
  const [openScholarship, setOpenScholarship] = useState<string | null>(null);

  const [docForm, setDocForm] = useState<DocForm | null>(null);
  const [schForm, setSchForm] = useState<ScholarshipForm | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const switchTab = (id: TabId) => { setActiveTab(id); setQ(''); };

  const shownDocs = useMemo(
    () => docs.filter((d) => matchesQuery(q, d.title, d.type, humanize(d.type), d.isVerified ? 'verified' : 'pending', personText(d.user), studentFacts(d.user))),
    [docs, q],
  );
  const shownPayments = useMemo(
    () => payments.filter((p) => matchesQuery(q, p.description, p.status, p.type, p.id, String(p.amount), personText(p.user))),
    [payments, q],
  );
  const shownScholarships = useMemo(
    () => scholarships.filter((s) => matchesQuery(q, s.name, s.provider, s.description, s.isActive ? 'open' : 'closed', (s.applications ?? []).flatMap((a) => [...personText(a.student), a.status]))),
    [scholarships, q],
  );

  const openNew = () => {
    setEditingId(null);
    if (activeTab === 'documents') setDocForm({ title: '', type: 'OTHER', fileUrl: '', issuedAt: '' });
    if (activeTab === 'scholarships') setSchForm({ name: '', amount: '', deadline: '', provider: '', description: '' });
  };
  const openEditDoc = (d: Doc) => {
    setEditingId(d.id);
    setDocForm({ title: d.title, type: d.type, fileUrl: d.fileUrl ?? '', issuedAt: d.issuedAt ? d.issuedAt.slice(0, 10) : '' });
  };
  const closeModal = () => { setDocForm(null); setSchForm(null); setEditingId(null); };

  const errorMessage = (err: unknown) => {
    const e = err as { response?: { data?: { message?: string } }; message?: string };
    return e.response?.data?.message || e.message || 'Failed to save';
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (docForm) {
        const body = { title: docForm.title.trim(), type: docForm.type, fileUrl: docForm.fileUrl.trim(), issuedAt: docForm.issuedAt ? new Date(docForm.issuedAt).toISOString() : undefined };
        if (editingId) await api.patch(`/documents/${editingId}`, body);
        else await api.post('/documents', body);
      } else if (schForm) {
        await api.post('/scholarships', {
          name: schForm.name.trim(),
          amount: schForm.amount ? Number(schForm.amount) : undefined,
          deadline: schForm.deadline ? new Date(schForm.deadline).toISOString() : undefined,
          provider: schForm.provider.trim() || undefined,
          description: schForm.description.trim() || undefined,
          isActive: true,
        });
      }
      toast.success('Saved successfully!');
      await mutate();
      closeModal();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const deleteDoc = async (id: string) => {
    try {
      await api.delete(`/documents/${id}`);
      mutate((cur) => cur && { ...cur, docs: cur.docs.filter((d) => d.id !== id) }, { revalidate: false });
      toast.success('Deleted successfully');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const setApplicationStatus = async (scholarshipId: string, appId: string, status: string) => {
    try {
      await api.patch(`/scholarships/applications/${appId}`, { status });
      mutate((cur) => cur && {
        ...cur,
        scholarships: cur.scholarships.map((s) => s.id !== scholarshipId ? s : { ...s, applications: s.applications?.map((a) => (a.id === appId ? { ...a, status } : a)) }),
      }, { revalidate: false });
      toast.success(`Application marked ${status.toLowerCase()}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const total = activeTab === 'documents' ? docs.length : activeTab === 'billing' ? payments.length : scholarships.length;
  const shown = activeTab === 'documents' ? shownDocs.length : activeTab === 'billing' ? shownPayments.length : shownScholarships.length;
  const placeholder = activeTab === 'documents'
    ? 'Search documents, owners, emails, roles…'
    : activeTab === 'billing' ? 'Search payer name, email, role, description or status…' : 'Search scholarships or applicant name, email…';
  const empty = (text: string) => <div className="p-10 text-center text-sm text-zinc-500">{text}</div>;

  return (
    <div className="flex flex-col lg:h-screen">
      <Topbar
        title="Administrative Management"
        subtitle="Documents, payments and scholarships, with the people behind each one"
        rightNode={activeTab === 'billing' ? (
          <Link href="/admin/finances" className="btn-secondary btn-sm">Open Finances</Link>
        ) : (
          <button onClick={openNew} className="btn-primary">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add New</span> {activeTab === 'documents' ? 'Document' : 'Scholarship'}
          </button>
        )}
      />

      {(docForm || schForm) && (
        <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="sheet-in tone-panel border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-5 sm:p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
                {editingId ? 'Edit ' : 'Create '}{docForm ? 'Document' : 'Scholarship'}
              </h2>
              <button onClick={closeModal} aria-label="Close" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 sm:p-6 space-y-4">
              {docForm && (
                <>
                  <p className="text-xs text-zinc-500">Documents you add here are stored under your own account.</p>
                  <div className="space-y-2">
                    <label className={label}>Document Title</label>
                    <input required value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} type="text" className="input" />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className={label}>Type</label>
                      <select aria-label="Type" value={docForm.type} onChange={(e) => setDocForm({ ...docForm, type: e.target.value })} className="input">
                        {DOC_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className={label}>Issued on</label>
                      <input value={docForm.issuedAt} onChange={(e) => setDocForm({ ...docForm, issuedAt: e.target.value })} type="date" className="input" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className={label}>File link</label>
                    <input required value={docForm.fileUrl} onChange={(e) => setDocForm({ ...docForm, fileUrl: e.target.value })} type="url" placeholder="https://…" className="input" />
                  </div>
                </>
              )}

              {schForm && (
                <>
                  <div className="space-y-2">
                    <label className={label}>Scholarship Name</label>
                    <input required value={schForm.name} onChange={(e) => setSchForm({ ...schForm, name: e.target.value })} type="text" className="input" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className={label}>Amount ($)</label>
                      <input value={schForm.amount} onChange={(e) => setSchForm({ ...schForm, amount: e.target.value })} type="number" min="0" className="input" />
                    </div>
                    <div className="space-y-2">
                      <label className={label}>Deadline</label>
                      <input value={schForm.deadline} onChange={(e) => setSchForm({ ...schForm, deadline: e.target.value })} type="date" className="input" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className={label}>Provider</label>
                    <input value={schForm.provider} onChange={(e) => setSchForm({ ...schForm, provider: e.target.value })} type="text" placeholder="e.g. Internal" className="input" />
                  </div>
                  <div className="space-y-2">
                    <label className={label}>Description</label>
                    <textarea value={schForm.description} onChange={(e) => setSchForm({ ...schForm, description: e.target.value })} className={`input min-h-[80px]`} />
                  </div>
                </>
              )}

              <div className="pt-4 flex justify-end gap-3 border-t border-zinc-200 dark:border-zinc-800 mt-6">
                <button type="button" onClick={closeModal} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving && <Loader2 className="w-4 h-4 animate-spin" />} Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-4 md:px-8">
        <div className="flex gap-6 max-w-7xl mx-auto overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={`relative isolate flex items-center gap-2 py-4 px-2 border-b-2 border-transparent text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-300'
                }`}
              >
                {isActive && <TabPill id="administrative-tab" variant="line" className="inset-x-0 -bottom-0.5" />}
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-4">
          <AdminSearch value={q} onChange={setQ} placeholder={placeholder} shown={shown} total={total} />

          {loading ? (
            <ContentSkeleton variant="table" />
          ) : activeTab === 'documents' ? (
            <div className={card}>
              {docs.length === 0 ? empty('No documents have been uploaded yet.') : shownDocs.length === 0 ? empty('No documents match your search.') : (
                <ul className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
                  {shownDocs.map((doc) => {
                    const mine = !!me?.id && doc.user?.id === me.id;
                    return (
                      <li key={doc.id} className="p-4 grid gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_auto] md:items-center">
                        <div className="min-w-0">
                          <p className="font-medium text-zinc-900 dark:text-white break-words">{doc.title}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                            <span>{humanize(doc.type)}</span>
                            <span>· Issued {fmtDate(doc.issuedAt ?? doc.createdAt)}</span>
                            {doc.expiresAt && <span>· Expires {fmtDate(doc.expiresAt)}</span>}
                            <Pill tone={doc.isVerified ? 'green' : 'amber'}>{doc.isVerified ? 'Verified' : 'Pending verification'}</Pill>
                          </div>
                        </div>
                        <PersonCell person={doc.user} extra={studentFacts(doc.user)} />
                        <div className="flex gap-2 md:justify-end">
                          {doc.fileUrl && (
                            <a href={safeHref(doc.fileUrl)} target="_blank" rel="noopener noreferrer" aria-label="Open file" className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg"><ExternalLink className="w-4 h-4" /></a>
                          )}
                          {mine && (
                            <>
                              <button onClick={() => openEditDoc(doc)} aria-label="Edit" className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                              <button onClick={() => deleteDoc(doc.id)} aria-label="Delete" className="p-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : activeTab === 'billing' ? (
            <div className={card}>
              <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500">
                Payments recorded in UniVerse (latest 500). Add or export payments from <Link href="/admin/finances" className="text-indigo-500 hover:underline">Finances</Link>.
              </div>
              {paymentsError ? <p className="p-10 text-center text-sm text-rose-500">{paymentsError}</p>
                : payments.length === 0 ? empty('No payments have been recorded yet.')
                : shownPayments.length === 0 ? empty('No payments match your search.') : (
                <ul className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
                  {shownPayments.map((p) => (
                    <li key={p.id} className="p-4 grid gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-center">
                      <PersonCell person={p.user} />
                      <div className="min-w-0 text-sm">
                        <p className="text-zinc-900 dark:text-white break-words">{p.description}</p>
                        <p className="text-xs text-zinc-500">{fmtDate(p.createdAt)}{p.type ? ` · ${humanize(p.type)}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-3 md:justify-end">
                        <span className={`text-sm font-semibold tabular-nums ${p.amount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-white'}`}>{money(p.amount, p.currency || 'USD')}</span>
                        <Pill tone={statusTone(p.status)}>{humanize(p.status)}</Pill>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {scholarships.length === 0 ? <div className={card}>{empty('No scholarships yet. Click "Add New Scholarship" to create one.')}</div>
                : shownScholarships.length === 0 ? <div className={card}>{empty('No scholarships or applicants match your search.')}</div>
                : shownScholarships.map((s) => {
                  const apps = s.applications;
                  const count = s._count?.applications ?? apps?.length ?? 0;
                  const shownApps = apps && q.trim() && !matchesQuery(q, s.name, s.provider, s.description) ? apps.filter((a) => matchesQuery(q, personText(a.student), a.status)) : apps;
                  const isOpen = openScholarship === s.id || (!!q.trim() && shownApps !== apps);
                  return (
                    <div key={s.id} className={card}>
                      <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-zinc-900 dark:text-white">{s.name}</p>
                            <Pill tone={s.isActive ? 'green' : 'zinc'}>{s.isActive ? 'Open' : 'Closed'}</Pill>
                          </div>
                          <p className="text-xs text-zinc-500 mt-1">
                            {[money(s.amount, s.currency || 'USD'), `Deadline ${s.deadline ? fmtDate(s.deadline) : 'rolling'}`, s.provider].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <button
                          onClick={() => setOpenScholarship(openScholarship === s.id ? null : s.id)}
                          disabled={!apps}
                          aria-expanded={isOpen}
                          className="btn-secondary btn-sm self-start sm:self-auto"
                        >
                          <Users className="w-4 h-4" /> {count} applicant{count === 1 ? '' : 's'}
                          {apps && <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
                        </button>
                      </div>
                      {isOpen && apps && (
                        <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/30">
                          {shownApps && shownApps.length > 0 ? (
                            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
                              {shownApps.map((a) => (
                                <li key={a.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                                  <PersonCell className="flex-1" person={a.student} extra={[studentFacts(a.student), `Applied ${fmtDate(a.appliedAt)}`].filter(Boolean).join(' · ')} />
                                  <select
                                    value={a.status}
                                    onChange={(e) => setApplicationStatus(s.id, a.id, e.target.value)}
                                    aria-label={`Status for ${a.student?.name ?? 'applicant'}`}
                                    className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-white"
                                  >
                                    {(APP_STATUSES as readonly string[]).includes(a.status) ? null : <option value={a.status}>{humanize(a.status)}</option>}
                                    {APP_STATUSES.map((st) => <option key={st} value={st}>{humanize(st)}</option>)}
                                  </select>
                                </li>
                              ))}
                            </ul>
                          ) : <p className="p-4 text-sm text-zinc-500">No one has applied yet.</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
