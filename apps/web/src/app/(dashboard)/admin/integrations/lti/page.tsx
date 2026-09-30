'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Copy, Link2, Loader2, Plug, Trash2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { authedJson } from '@/lib/authed-fetch';
import { confirmDialog } from '@/components/ui/Dialogs';
import { cn } from '@/lib/utils';

interface Platform { id: string; name: string; issuer: string; clientId: string; deploymentIds: string[]; authLoginUrl: string; jwksUrl: string; trustEmails: boolean; isActive: boolean; courses: number; users: number; createdAt: string }
interface Resp { platforms: Platform[]; tool: { loginUrl: string; launchUrl: string; redirectUris: string[]; jwksUrl: string; domain: string }; ready: boolean; canvasConfig: object }

const PRESETS: Record<string, { label: string; hint: string; fill: (site: string) => Partial<Form> }> = {
  moodle: { label: 'Moodle', hint: 'Site administration → Plugins → External tool → Manage tools → Configure a tool manually. After saving, “View configuration details” shows these values.', fill: (s) => ({ name: 'Moodle', issuer: s, authLoginUrl: `${s}/mod/lti/auth.php`, jwksUrl: `${s}/mod/lti/certs.php` }) },
  canvas: { label: 'Canvas', hint: 'Admin → Developer Keys → + LTI Key → paste the JSON below. The key’s number is the client ID; add it under Settings → Apps to get the deployment ID.', fill: () => ({ name: 'Canvas', issuer: 'https://canvas.instructure.com', authLoginUrl: 'https://sso.canvaslms.com/api/lti/authorize_redirect', jwksUrl: 'https://sso.canvaslms.com/api/lti/security/jwks' }) },
  other: { label: 'Other (Blackboard, Brightspace…)', hint: 'Register UniVerse as an LTI 1.3 tool with the values below, then copy the platform’s issuer, client ID, authorisation URL, keyset URL and deployment ID here.', fill: () => ({}) },
};

type Form = { name: string; issuer: string; clientId: string; deploymentIds: string; authLoginUrl: string; jwksUrl: string; trustEmails: boolean };
const EMPTY: Form = { name: '', issuer: '', clientId: '', deploymentIds: '', authLoginUrl: '', jwksUrl: '', trustEmails: false };

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <span className="w-40 shrink-0 text-xs text-zinc-500">{label}</span>
      <code className="flex-1 min-w-0 truncate text-xs text-zinc-800 dark:text-zinc-200">{value}</code>
      <button onClick={() => navigator.clipboard.writeText(value).then(() => toast.success('Copied'))} aria-label={`Copy ${label}`} className="p-1 text-zinc-400 hover:text-indigo-500"><Copy className="w-4 h-4" /></button>
    </div>
  );
}

export default function LtiPage() {
  const { data, mutate } = useSWR<Resp>('/api/lti/platforms', authedJson);
  const [preset, setPreset] = useState<keyof typeof PRESETS>('moodle');
  const [site, setSite] = useState('');
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);

  const applyPreset = (p: keyof typeof PRESETS, s = site) => { setPreset(p); setForm((f) => ({ ...f, ...PRESETS[p].fill(s.replace(/\/+$/, '')) })); };
  const save = async () => {
    setBusy(true);
    try { await authedJson('/api/lti/platforms', { method: 'POST', body: JSON.stringify(form) }); toast.success(`${form.name} connected`); setForm(EMPTY); setSite(''); await mutate(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const patch = async (p: Platform, body: object, msg: string) => {
    try { await authedJson(`/api/lti/platforms/${p.id}`, { method: 'PATCH', body: JSON.stringify(body) }); toast.success(msg); await mutate(); } catch (e) { toast.error((e as Error).message); }
  };
  const remove = async (p: Platform) => {
    if (!(await confirmDialog({ title: `Disconnect ${p.name}?`, message: 'Launches from this LMS stop working. Courses and accounts already created in UniVerse stay.', confirmLabel: 'Disconnect', destructive: true }))) return;
    try { await authedJson(`/api/lti/platforms/${p.id}`, { method: 'DELETE' }); toast.success('Disconnected'); await mutate(); } catch (e) { toast.error((e as Error).message); }
  };

  const input = 'mt-1 w-full rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40';
  return (
    <>
      <Topbar title="LMS integration (LTI 1.3)" subtitle="Open UniVerse from Moodle, Canvas, Blackboard or Brightspace with single sign-on and linked courses" />
      <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-5 min-w-0 w-full">
        {data && !data.ready && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] p-4 text-sm text-amber-800 dark:text-amber-200 flex gap-3"><AlertTriangle className="w-5 h-5 shrink-0" /><p>Before launches can sign people in, add a <b>SESSION_SECRET</b> secret (a random string of 32+ characters) in Cloudflare → your Worker → Settings → Variables and Secrets.</p></div>
        )}

        <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5">
          <p className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Link2 className="w-5 h-5 text-indigo-500" /> 1. Give your LMS these values</p>
          {!data ? <Loader2 className="mt-3 w-5 h-5 animate-spin text-indigo-400" /> : (
            <div className="mt-2 divide-y divide-zinc-100 dark:divide-white/[0.06]">
              <CopyRow label="Tool / launch URL" value={data.tool.launchUrl} />
              <CopyRow label="Initiate login URL" value={data.tool.loginUrl} />
              <CopyRow label="Redirection URI" value={data.tool.redirectUris[0]} />
              <CopyRow label="Public keyset URL" value={data.tool.jwksUrl} />
              <CopyRow label="Domain" value={data.tool.domain} />
              <details className="pt-2">
                <summary className="cursor-pointer text-xs font-semibold text-indigo-600 dark:text-indigo-300 py-2">Canvas developer key JSON</summary>
                <pre className="text-[11px] bg-zinc-100 dark:bg-black/30 rounded-xl p-3 overflow-x-auto">{JSON.stringify(data.canvasConfig, null, 2)}</pre>
                <button onClick={() => navigator.clipboard.writeText(JSON.stringify(data.canvasConfig, null, 2)).then(() => toast.success('Copied'))} className="mt-2 text-xs font-semibold text-indigo-500 inline-flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Copy JSON</button>
              </details>
            </div>
          )}
          <p className="mt-3 text-[11px] text-zinc-500">Share name and email with the tool, and set it to open in a new window (UniVerse can’t be shown inside another site’s frame, for security).</p>
        </section>

        <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 space-y-3">
          <p className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Plug className="w-5 h-5 text-indigo-500" /> 2. Register your LMS here</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(PRESETS).map(([k, p]) => <button key={k} onClick={() => applyPreset(k as keyof typeof PRESETS)} className={cn('px-3 py-1.5 rounded-xl text-sm font-semibold', preset === k ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-200')}>{p.label}</button>)}
          </div>
          <p className="text-xs text-zinc-500">{PRESETS[preset].hint}</p>
          {preset === 'moodle' && <label className="block"><span className="text-xs font-semibold text-zinc-500">Your Moodle address</span><input value={site} onChange={(e) => { setSite(e.target.value); applyPreset('moodle', e.target.value); }} placeholder="https://moodle.your-university.fr" className={input} /></label>}
          <div className="grid sm:grid-cols-2 gap-3">
            {([['name', 'Name'], ['issuer', 'Issuer (platform ID)'], ['clientId', 'Client ID'], ['deploymentIds', 'Deployment ID(s)'], ['authLoginUrl', 'Authorisation URL'], ['jwksUrl', 'Public keyset URL']] as const).map(([k, l]) => (
              <label key={k} className="block"><span className="text-xs font-semibold text-zinc-500">{l}</span><input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={input} /></label>
            ))}
          </div>
          <label className="flex items-start gap-3 text-sm text-zinc-700 dark:text-zinc-200">
            <input type="checkbox" checked={form.trustEmails} onChange={(e) => setForm({ ...form, trustEmails: e.target.checked })} className="mt-1 w-4 h-4 accent-indigo-500" />
            <span>Link to existing UniVerse accounts with the same email <span className="block text-xs text-zinc-500">Only if your LMS verifies email addresses (people can’t change them freely). Admin accounts are never linked this way.</span></span>
          </label>
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-60">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />} Connect LMS</button>
        </section>

        <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5">
          <p className="font-bold text-zinc-900 dark:text-white">Connected</p>
          {!data ? null : data.platforms.length === 0 ? <p className="mt-2 text-sm text-zinc-500">No LMS connected yet.</p> : (
            <ul className="mt-2 divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {data.platforms.map((p) => (
                <li key={p.id} className="py-3 flex flex-wrap items-center gap-3">
                  {p.isActive ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertTriangle className="w-5 h-5 text-zinc-400" />}
                  <span className="flex-1 min-w-[12rem]">
                    <span className="block text-sm font-semibold text-zinc-900 dark:text-white">{p.name}</span>
                    <span className="block text-[11px] text-zinc-500 truncate">{p.issuer} · client {p.clientId} · {p.courses} course{p.courses === 1 ? '' : 's'} · {p.users} user{p.users === 1 ? '' : 's'}</span>
                  </span>
                  <button onClick={() => patch(p, { isActive: !p.isActive }, p.isActive ? 'Paused' : 'Resumed')} className="text-xs font-semibold text-zinc-500 hover:text-indigo-500">{p.isActive ? 'Pause' : 'Resume'}</button>
                  <button onClick={() => remove(p)} aria-label={`Disconnect ${p.name}`} className="p-1.5 text-zinc-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
