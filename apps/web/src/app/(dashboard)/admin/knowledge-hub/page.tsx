'use client';
import { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { BookOpen, ExternalLink, Eye, EyeOff, FileText, Globe, Loader2, Lock, Plus, Trash2, Upload, Users, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { uploadChatFile } from '@/components/chat/chat-client';
import { confirmDialog } from '@/components/ui/Dialogs';
import { api, fetcher } from '@/lib/fetcher';
import { safeHref } from '@/lib/safe-href';
import { AdminSearch, PersonCell, RoleBadge, matchesQuery, personText, type PersonInfo } from '@/components/admin/AdminPeople';

interface Resource {
  id: string; title: string; description?: string | null; category?: string | null; url?: string | null; isPublic: boolean;
  createdAt: string; authorId?: string; author?: PersonInfo | null; course?: { name: string; code?: string } | null;
}

const CATEGORIES = ['Computer Science', 'Business', 'Finance', 'General'];
const field = 'w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500';
const card = 'rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50';

export default function AdminKnowledgeHubPage() {
  const { data, error, isLoading, mutate } = useSWR<Resource[]>('/knowledge-hub', fetcher);
  const resources = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const [q, setQ] = useState('');
  const [visibility, setVisibility] = useState<'all' | 'public' | 'private'>('all');
  const [category, setCategory] = useState('All');
  const [adding, setAdding] = useState(false);

  const categories = useMemo(() => ['All', ...[...new Set(resources.map((r) => r.category || 'General'))].sort()], [resources]);

  const shown = useMemo(() => resources.filter((r) =>
    (visibility === 'all' || (visibility === 'public') === r.isPublic) &&
    (category === 'All' || (r.category || 'General') === category) &&
    matchesQuery(q, r.title, r.description, r.category, r.course?.name, r.course?.code, r.url, personText(r.author)),
  ), [resources, q, visibility, category]);

  // Who contributes: one row per author with how many resources they added.
  const contributors = useMemo(() => {
    const map = new Map<string, { person: PersonInfo; total: number; publicCount: number }>();
    for (const r of resources) {
      const key = r.author?.id ?? r.authorId ?? r.author?.email ?? r.author?.name ?? 'unknown';
      const row = map.get(key) ?? { person: r.author ?? { name: 'Unknown' }, total: 0, publicCount: 0 };
      row.total += 1;
      if (r.isPublic) row.publicCount += 1;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [resources]);

  const togglePublic = async (r: Resource) => {
    try {
      await api.patch(`/knowledge-hub/${r.id}`, { isPublic: !r.isPublic });
      mutate((cur) => cur?.map((x) => (x.id === r.id ? { ...x, isPublic: !r.isPublic } : x)), { revalidate: false });
      toast.success(r.isPublic ? 'Made private' : 'Made public');
    } catch {
      toast.error('Could not change visibility');
    }
  };

  const remove = async (r: Resource) => {
    if (!(await confirmDialog({ title: `Delete "${r.title}"?`, message: 'It is removed for its author and everyone it was shared with.', destructive: true }))) return;
    try {
      await api.delete(`/knowledge-hub/${r.id}`);
      mutate((cur) => cur?.filter((x) => x.id !== r.id), { revalidate: false });
      toast.success('Resource deleted');
    } catch {
      toast.error('Failed to delete resource');
    }
  };

  const stats = [
    { label: 'Resources', value: resources.length, icon: BookOpen },
    { label: 'Public', value: resources.filter((r) => r.isPublic).length, icon: Globe },
    { label: 'Private', value: resources.filter((r) => !r.isPublic).length, icon: Lock },
    { label: 'Contributors', value: contributors.length, icon: Users },
  ];

  return (
    <>
      <Topbar
        title="Knowledge Hub Management"
        subtitle="Every resource on the platform and who added it"
        rightNode={<button onClick={() => setAdding(true)} className="btn-primary"><Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add</span> Resource</button>}
      />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stats.map((s) => (
              <div key={s.label} className={`${card} p-4`}>
                <s.icon className="w-4 h-4 text-indigo-500 mb-2" />
                <p className="text-2xl font-bold text-zinc-900 dark:text-white tabular-nums">{s.value}</p>
                <p className="text-xs text-zinc-500">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <AdminSearch value={q} onChange={setQ} placeholder="Search title, category, course, or author name/email/role…" shown={shown.length} total={resources.length} />
            <div className="flex flex-wrap gap-1">
              {(['all', 'public', 'private'] as const).map((v) => (
                <button key={v} onClick={() => setVisibility(v)} aria-pressed={visibility === v}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${visibility === v ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]'}`}>
                  {v === 'all' ? 'All' : v === 'public' ? 'Public' : 'Private'}
                </button>
              ))}
              <span className="w-px bg-zinc-200 dark:bg-zinc-800 mx-1" />
              {categories.map((c) => (
                <button key={c} onClick={() => setCategory(c)} aria-pressed={category === c}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${category === c ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
            <section className={`${card} overflow-hidden`}>
              <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex justify-between">
                <h2 className="font-semibold text-zinc-900 dark:text-white">Resources</h2>
                <span className="text-xs text-zinc-500">{shown.length} item{shown.length === 1 ? '' : 's'}</span>
              </div>
              {error ? <p className="p-10 text-center text-sm text-rose-500">Could not load resources.</p>
                : isLoading ? <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
                : resources.length === 0 ? <p className="p-10 text-center text-sm text-zinc-500">No one has added a resource yet.</p>
                : shown.length === 0 ? <p className="p-10 text-center text-sm text-zinc-500">No resources match your search.</p>
                : (
                  <ul className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
                    {shown.map((r) => (
                      <li key={r.id} className="p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-white/[0.04] flex items-center justify-center text-zinc-500 shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white break-words">{r.title}</h3>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${r.isPublic ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400'}`}>
                                {r.isPublic ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}{r.isPublic ? 'Public' : 'Private'}
                              </span>
                            </div>
                            {r.description && <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 line-clamp-2">{r.description}</p>}
                            <p className="text-xs text-zinc-500 mt-1">
                              {[r.category || 'General', r.course ? `${r.course.code ? `${r.course.code} · ` : ''}${r.course.name}` : null, `Added ${format(new Date(r.createdAt), 'd MMM yyyy')}`].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {r.url && (
                              <a href={safeHref(r.url)} target="_blank" rel="noopener noreferrer" aria-label="Open" className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"><ExternalLink className="w-4 h-4" /></a>
                            )}
                            <button onClick={() => togglePublic(r)} aria-label={r.isPublic ? 'Make private' : 'Make public'} title={r.isPublic ? 'Make private' : 'Make public'} className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg">
                              {r.isPublic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                            <button onClick={() => remove(r)} aria-label="Delete" className="p-2 text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                        <div className="sm:pl-[3.25rem]">
                          <PersonCell person={r.author} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
            </section>

            <aside className={`${card} overflow-hidden`}>
              <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
                <h2 className="font-semibold text-zinc-900 dark:text-white">Contributors</h2>
                <p className="text-xs text-zinc-500">Tap someone to see only their resources</p>
              </div>
              {contributors.length === 0 ? <p className="p-6 text-sm text-zinc-500">No contributors yet.</p> : (
                <ul className="divide-y divide-zinc-200 dark:divide-zinc-800/60 max-h-[32rem] overflow-y-auto">
                  {contributors.map((c, i) => (
                    <li key={c.person.id ?? c.person.email ?? i}>
                      <button onClick={() => setQ(c.person.email || c.person.name || '')} className="w-full text-left p-3 hover:bg-zinc-50 dark:hover:bg-white/[0.03] flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium text-zinc-900 dark:text-white truncate">{c.person.name || 'Unknown'}</span>
                            <RoleBadge role={c.person.role} />
                          </div>
                          {c.person.email && <p className="text-xs text-zinc-500 truncate">{c.person.email}</p>}
                        </div>
                        <span className="text-xs text-zinc-500 tabular-nums shrink-0">{c.total} · {c.publicCount} public</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        </div>
      </div>

      {adding && <AddResourceModal onClose={() => setAdding(false)} onAdded={() => { setAdding(false); mutate(); }} />}
    </>
  );
}

function AddResourceModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ title: '', description: '', category: 'General', url: '', kind: 'Link', isPublic: true });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (!form.title.trim() && !file) return void toast.error('Add a title or pick a file');
    setBusy(true);
    try {
      let url = form.kind === 'Link' ? form.url.trim() : '';
      if (form.kind !== 'Link' && file) {
        const uploaded = await uploadChatFile(file);
        url = uploaded.startsWith('/') ? `${window.location.origin}${uploaded}` : uploaded;
      }
      await api.post('/knowledge-hub', {
        title: form.title.trim() || file?.name || 'Untitled',
        description: form.description.trim() || undefined,
        category: form.category,
        url: url || undefined,
        isPublic: form.isPublic,
      });
      toast.success('Resource added');
      onAdded();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string | string[] } }; message?: string };
      const msg = err.response?.data?.message;
      toast.error((Array.isArray(msg) ? msg.join(', ') : msg) || err.message || 'Failed to add resource');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="sheet-in tone-panel border border-zinc-200 dark:border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Add resource</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="w-5 h-5" /></button>
        </div>
        <select className={field} value={form.kind} onChange={(e) => { setForm({ ...form, kind: e.target.value }); setFile(null); }}>
          <option value="Link">Web link</option>
          <option value="File">File upload</option>
        </select>
        <input className={field} placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        {form.kind === 'Link' ? (
          <input className={field} type="url" placeholder="https://…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-indigo-500 rounded-xl p-5 flex flex-col items-center gap-1 text-sm text-zinc-600 dark:text-zinc-300">
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Upload className="w-6 h-6 text-zinc-400" />
            {file ? file.name : 'Choose a file (up to 25 MB)'}
          </button>
        )}
        <textarea className={`${field} min-h-[70px]`} placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <select className={field} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} /> Visible to everyone
        </label>
        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={busy} className="btn-primary">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add</button>
        </div>
      </div>
    </div>
  );
}
