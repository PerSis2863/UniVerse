'use client';

import { useId, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Check, Copy, KeyRound, Loader2, Play, Plus, Puzzle, Trash2, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { confirmDialog } from '@/components/ui/Dialogs';
import { cn } from '@/lib/utils';

// Admin → Integrations → Chat apps (Stage 5 · Q20, src/server/chat-apps.ts): the school's own slash
// commands. Each app has an https address that UniVerse calls, signed, when someone types one of
// its commands in a chat; the app's answer is posted in the chat.

type Command = { name: string; hint: string };
type App = { id: string; name: string; description: string | null; url: string; commands: Command[]; permissions: string[]; enabled: boolean; lastCalledAt: string | null; lastStatus: string | null };
type List = { apps: App[]; permissions: string[]; builtIn: string[] };

const PERMISSIONS: { id: string; label: string; hint: string }[] = [
  { id: 'post', label: 'Post answers in the chat', hint: 'Everyone in the chat sees them. Without this, only the person who typed the command does.' },
  { id: 'read_recent', label: 'Read the last 10 messages', hint: 'Sent along with the command, so the app knows what the chat is about.' },
];
const input = 'w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 px-3 py-2 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40';
const card = 'rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900/50 p-5';
const call = (url: string, method: string, body?: unknown) => authedJson<App & { secret?: string; ok?: boolean; status?: string; reply?: string | null }>(url, { method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) });

export function ChatAppsPanel() {
  const { data, error, mutate } = useSWR<List>('/api/admin/chat-apps', authedJson, { revalidateOnFocus: false });
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState<{ app: string; value: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    try { await work(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const toggle = (a: App) => run(`on-${a.id}`, async () => { await call(`/api/admin/chat-apps/${a.id}`, 'PATCH', { enabled: !a.enabled }); await mutate(); toast.success(`${a.name} ${a.enabled ? 'switched off' : 'switched on'}`); });
  const test = (a: App) => run(`test-${a.id}`, async () => {
    const r = await call(`/api/admin/chat-apps/${a.id}/test`, 'POST');
    if (r.ok) toast.success(`${a.name} answered (${r.status})`, r.reply ? { description: r.reply.slice(0, 120) } : undefined);
    else toast.error(`${a.name} didn’t answer`, { description: r.status === 'timeout' ? 'No answer within 5 seconds.' : `Status: ${r.status}` });
    await mutate();
  });
  const rotate = (a: App) => run(`key-${a.id}`, async () => {
    if (!(await confirmDialog({ title: `New secret for ${a.name}?`, message: 'The old secret stops working at once: update the app with the new one.', confirmLabel: 'Make a new secret' }))) return;
    const r = await call(`/api/admin/chat-apps/${a.id}`, 'PATCH', { newSecret: true });
    if (r.secret) setSecret({ app: a.name, value: r.secret });
  });
  const remove = (a: App) => run(`rm-${a.id}`, async () => {
    if (!(await confirmDialog({ title: `Remove ${a.name}?`, message: `Its commands (${a.commands.map((c) => `/${c.name}`).join(', ')}) stop working in every chat.`, confirmLabel: 'Remove', destructive: true }))) return;
    await call(`/api/admin/chat-apps/${a.id}`, 'DELETE');
    await mutate();
    toast.success(`${a.name} removed`);
  });

  if (error && !data) return <p className="text-sm text-rose-600 dark:text-rose-400">{(error as Error).message}</p>;
  if (!data) return <div className="h-40 rounded-2xl skeleton" />;
  return (
    <div className="space-y-6">
      <section className={card} aria-labelledby="apps-h">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="apps-h" className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><Puzzle className="w-5 h-5 text-teal-600 dark:text-teal-400" aria-hidden /> Chat apps</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Your school’s own slash commands, such as <code>/library</code> or <code>/canteen</code>. When someone types one in a chat, UniVerse asks your app and posts its answer.</p>
          </div>
          {!adding && <button type="button" onClick={() => setAdding(true)} className="btn-primary min-h-11 inline-flex items-center gap-1.5"><Plus className="w-4 h-4" aria-hidden /> Add a chat app</button>}
        </div>
        {secret && <SecretBox {...secret} onClose={() => setSecret(null)} />}
        {adding && <AddForm builtIn={data.builtIn} onCancel={() => setAdding(false)} onCreated={async (app) => { setAdding(false); if (app.secret) setSecret({ app: app.name, value: app.secret }); await mutate(); }} />}
        {data.apps.length === 0 && !adding ? <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-4">No chat apps yet.</p> : (
          <ul className="mt-4 space-y-3">
            {data.apps.map((a) => (
              <li key={a.id} className="rounded-xl border border-zinc-200 dark:border-white/10 p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold text-zinc-900 dark:text-white">{a.name}</span>
                  {a.commands.map((c) => <code key={c.name} className="text-xs rounded-md bg-teal-500/10 text-teal-800 dark:text-teal-200 px-1.5 py-0.5">/{c.name}</code>)}
                  <button type="button" role="switch" aria-checked={a.enabled} aria-label={`${a.name} switched on`} onClick={() => void toggle(a)} disabled={busy !== null}
                    className="ml-auto min-h-11 inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <span className={cn('w-9 h-5 rounded-full p-0.5 transition-colors', a.enabled ? 'bg-emerald-600' : 'bg-zinc-400 dark:bg-zinc-600')}>
                      <span className={cn('block w-4 h-4 rounded-full bg-white shadow transition-transform', a.enabled && 'translate-x-4')} />
                    </span>
                    {a.enabled ? 'On' : 'Off'}
                  </button>
                </div>
                {a.description && <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">{a.description}</p>}
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 break-all">{a.url}</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                  {a.permissions.includes('post') ? 'Posts answers in the chat' : 'Answers only the person who asks'}{a.permissions.includes('read_recent') ? ' · reads the last 10 messages' : ''}
                  {a.lastCalledAt ? ` · last used ${new Date(a.lastCalledAt).toLocaleString()} (${a.lastStatus})` : ' · not used yet'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void test(a)} disabled={busy !== null} className="btn-secondary min-h-11 inline-flex items-center gap-1.5">{busy === `test-${a.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" aria-hidden />} Send a test</button>
                  <button type="button" onClick={() => void rotate(a)} disabled={busy !== null} className="btn-secondary min-h-11 inline-flex items-center gap-1.5"><KeyRound className="w-4 h-4" aria-hidden /> New secret</button>
                  <button type="button" onClick={() => void remove(a)} disabled={busy !== null} className="btn-secondary min-h-11 inline-flex items-center gap-1.5 !text-rose-700 dark:!text-rose-300"><Trash2 className="w-4 h-4" aria-hidden /> Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={card} aria-labelledby="apps-how-h">
        <h2 id="apps-how-h" className="font-semibold text-zinc-900 dark:text-white">How an app answers</h2>
        <ol className="list-decimal pl-5 mt-2 space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
          <li>UniVerse sends a <code>POST</code> with JSON: the <code>command</code>, its <code>text</code>, the <code>user</code> (id, first name, role) and the <code>chat</code> (id, name). Never email addresses.</li>
          <li>Check the <code>UniVerse-Signature</code> header (<code>t=…,v1=…</code>): an HMAC-SHA256 of <code>t + &quot;.&quot; + body</code> with the app’s secret, the same as webhooks.</li>
          <li>Answer within 5 seconds with <code>{'{ "text": "…" }'}</code> (up to 2,000 characters). Add <code>&quot;visibility&quot;: &quot;me&quot;</code> to answer only the person who asked.</li>
        </ol>
      </section>
    </div>
  );
}

function SecretBox({ app, value, onClose }: { app: string; value: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="mt-4 rounded-xl border border-amber-400/60 bg-amber-50 dark:bg-amber-500/10 p-4">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm text-amber-950 dark:text-amber-100"><strong>Copy {app}’s secret now.</strong> It isn’t shown again. Your app uses it to check that requests come from UniVerse.</p>
        <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-full text-amber-900 dark:text-amber-100 hover:bg-amber-200/60 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="flex-1 min-w-0 break-all rounded-lg bg-white dark:bg-zinc-950 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100">{value}</code>
        <button type="button" onClick={() => { void navigator.clipboard.writeText(value).then(() => { setCopied(true); toast.success('Copied'); }); }} className="btn-secondary min-h-11 inline-flex items-center gap-1.5">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy</button>
      </div>
    </div>
  );
}

function AddForm({ builtIn, onCancel, onCreated }: { builtIn: string[]; onCancel: () => void; onCreated: (app: App & { secret?: string }) => void }) {
  const id = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [commands, setCommands] = useState<Command[]>([{ name: '', hint: '' }]);
  const [permissions, setPermissions] = useState<string[]>(['post']);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      onCreated(await call('/api/admin/chat-apps', 'POST', { name, description, url, commands: commands.filter((c) => c.name.trim()), permissions }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const setCommand = (i: number, patch: Partial<Command>) => setCommands((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="mt-4 rounded-xl border border-zinc-200 dark:border-white/10 p-4 space-y-3" aria-label="Add a chat app">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required placeholder="Library desk" className={cn(input, 'mt-1')} /></label>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">The app’s address<input value={url} onChange={(e) => setUrl(e.target.value)} type="url" required placeholder="https://…" className={cn(input, 'mt-1')} /></label>
      </div>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">What it does (optional)<input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} className={cn(input, 'mt-1')} /></label>
      <fieldset>
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Commands (up to 5)</legend>
        <p id={`${id}-cmd`} className="text-xs text-zinc-600 dark:text-zinc-400">Letters, digits and dashes. Not UniVerse’s own: {builtIn.map((b) => `/${b}`).join(', ')}.</p>
        {commands.map((c, i) => (
          <div key={i} className="mt-2 flex flex-wrap gap-2">
            <label className="sr-only" htmlFor={`${id}-n${i}`}>Command {i + 1}</label>
            <input id={`${id}-n${i}`} aria-describedby={`${id}-cmd`} value={c.name} onChange={(e) => setCommand(i, { name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} maxLength={20} placeholder="library" className={cn(input, 'w-40')} />
            <label className="sr-only" htmlFor={`${id}-h${i}`}>What command {i + 1} does</label>
            <input id={`${id}-h${i}`} value={c.hint} onChange={(e) => setCommand(i, { hint: e.target.value })} maxLength={80} placeholder="Find a book in the library" className={cn(input, 'flex-1 min-w-[12rem]')} />
            {commands.length > 1 && <button type="button" onClick={() => setCommands((list) => list.filter((_, j) => j !== i))} aria-label={`Remove command ${i + 1}`} className="btn-secondary min-h-11 px-3"><X className="w-4 h-4" /></button>}
          </div>
        ))}
        {commands.length < 5 && <button type="button" onClick={() => setCommands((list) => [...list, { name: '', hint: '' }])} className="mt-2 text-sm font-medium text-indigo-700 dark:text-indigo-300 min-h-11">+ Another command</button>}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">What the app may do</legend>
        {PERMISSIONS.map((p) => (
          <label key={p.id} className="flex items-start gap-2 text-sm text-zinc-800 dark:text-zinc-200 min-h-11">
            <input type="checkbox" className="mt-1 w-4 h-4" checked={permissions.includes(p.id)} onChange={(e) => setPermissions((list) => (e.target.checked ? [...list, p.id] : list.filter((x) => x !== p.id)))} />
            <span><span className="font-medium">{p.label}</span><span className="block text-xs text-zinc-600 dark:text-zinc-400">{p.hint}</span></span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="btn-primary min-h-11 inline-flex items-center gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Add the app</button>
        <button type="button" onClick={onCancel} className="btn-secondary min-h-11">Cancel</button>
      </div>
    </form>
  );
}
