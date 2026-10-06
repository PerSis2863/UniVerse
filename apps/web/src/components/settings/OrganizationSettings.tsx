'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Loader2, Save } from 'lucide-react';
import Link from '@/components/ui/Link';
import { authedJson } from '@/lib/authed-fetch';

// Admin Settings → Organization: the school's name and the server's security status (read live).

type Settings = {
  organization: { name: string };
  security: { demoLogin: boolean; email: boolean; credentialSigning: boolean; fileStorage: boolean; pendingApplications: number; suspendedAccounts: number };
};

function StatusRow({ ok, neutral, title, detail }: { ok: boolean; neutral?: boolean; title: string; detail: string }) {
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  return (
    <li className="flex items-start gap-3 p-4 rounded-2xl bg-[var(--fill)]">
      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${ok ? 'text-emerald-500' : neutral ? 'text-amber-500' : 'text-rose-500'}`} />
      <div>
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</p>
        <p className="text-sm text-zinc-500 mt-0.5">{detail}</p>
      </div>
    </li>
  );
}

export function OrganizationSettings() {
  const { data, mutate } = useSWR<Settings>('/api/admin/settings', authedJson);
  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? data?.organization.name ?? '';
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await authedJson('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ name }) });
      await mutate();
      setDraft(null);
      toast.success('Organization name saved');
    } catch (err) {
      toast.error((err as Error).message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="space-y-2">
        <label htmlFor="org-name" className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Organization name</label>
        <div className="flex gap-2">
          <input id="org-name" value={name} onChange={(e) => setDraft(e.target.value)} placeholder={data ? '' : 'Loading…'} maxLength={120} className="input flex-1" />
          <button type="submit" disabled={saving || !name.trim() || name.trim() === data?.organization.name} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
        <p className="text-xs text-zinc-500">Shown on billing and reports.</p>
      </form>
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Security status (live from this server)</p>
        {!data ? <div className="skeleton h-40 rounded-2xl" /> : (
          <ul className="space-y-2">
            <StatusRow ok={!data.security.demoLogin} title={data.security.demoLogin ? 'Demo login is ON' : 'Demo login is off'}
              detail={data.security.demoLogin ? 'Anyone can sign in as the demo accounts. The demo admin is read-only, but turn this off for a real school: remove DEMO_LOGIN_ENABLED in Cloudflare → universe-web → Settings → Variables and secrets.' : 'Only real accounts can sign in.'} />
            <StatusRow ok title="Sign-in tokens verified on every request" detail="Google/Firebase sign-ins are checked with Google's keys; suspended accounts are blocked immediately." />
            <StatusRow ok title="Rate limits on" detail="300 API calls a minute per person, 20 a minute for AI, uploads and support emails." />
            <StatusRow ok title="Uploads checked" detail="Only documents, images, audio and video; nothing that could run as a web page." />
            <StatusRow ok={data.security.credentialSigning} title={data.security.credentialSigning ? 'Credentials are digitally signed' : 'Credential signing key missing'} detail={data.security.credentialSigning ? 'Issued credentials can be verified by anyone.' : 'Set CREDENTIAL_SIGNING_PRIVATE_KEY to issue verifiable credentials.'} />
            <StatusRow ok={data.security.email} title={data.security.email ? 'Email notifications on' : 'Email not set up'} detail={data.security.email ? 'Sent through Resend.' : 'Add RESEND_API_KEY to send emails.'} />
            <StatusRow ok={data.security.suspendedAccounts === 0} neutral title={`${data.security.suspendedAccounts} suspended account${data.security.suspendedAccounts === 1 ? '' : 's'}`} detail="Suspended people can't sign in or use the API." />
            <StatusRow ok title="Staff accounts need approval" detail="Choosing “teacher” or “NGO” when signing up only sends an application; the role is granted when an admin approves it." />
            <StatusRow ok={data.security.pendingApplications === 0} neutral title={`${data.security.pendingApplications} application${data.security.pendingApplications === 1 ? '' : 's'} waiting`} detail="Review them in Approvals." />
          </ul>
        )}
        <Link href="/admin/audit" className="inline-flex items-center gap-1.5 text-sm font-semibold text-tint-text">See who changed what in the Activity Log →</Link>
      </div>
    </div>
  );
}
