'use client';
import { AccountSecurity } from '@/components/settings/AccountSecurity';
import { DeleteAccount } from '@/components/settings/DeleteAccount';
import { LowDataToggle } from '@/components/settings/LowDataToggle';

import { Topbar } from '@/components/layout/Topbar';
import { Save, Building, Shield, Bell, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import useSWR from 'swr';
import { toast } from 'sonner';
import Link from '@/components/ui/Link';
import { authedJson } from '@/lib/authed-fetch';
import { useState } from 'react';
import { EmailNotificationsSwitch } from '@/components/notifications/EmailNotificationsSwitch';
import { RecentSignIns } from '@/components/security/RecentSignIns';
import { DownloadMyData } from '@/components/settings/DownloadMyData';

type Settings = {
  organization: { name: string };
  security: { demoLogin: boolean; email: boolean; credentialSigning: boolean; fileStorage: boolean; pendingApplications: number; suspendedAccounts: number };
};

function StatusRow({ ok, neutral, title, detail }: { ok: boolean; neutral?: boolean; title: string; detail: string }) {
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  return (
    <li className="flex items-start gap-3 p-4 rounded-xl border border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-white/[0.02]">
      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${ok ? 'text-emerald-500' : neutral ? 'text-amber-500' : 'text-rose-500'}`} />
      <div>
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</p>
        <p className="text-sm text-zinc-500 mt-0.5">{detail}</p>
      </div>
    </li>
  );
}

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState('general');
  const { data, mutate } = useSWR<Settings>('/api/admin/settings', authedJson);
  const [draft, setName] = useState<string | null>(null);
  const name = draft ?? data?.organization.name ?? null;
  const [saving, setSaving] = useState(false);

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name?.trim()) return;
    setSaving(true);
    try {
      await authedJson('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ name }) });
      await mutate();
      setName(null);
      toast.success('Organization name saved');
    } catch (err) {
      toast.error((err as Error).message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'general', label: 'General', icon: Building },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  return (
    <>
      <Topbar title="Organization Settings" subtitle="Manage your university platform configuration" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          
          {/* Tabs */}
          <div className="flex space-x-1 border-b border-zinc-200 dark:border-zinc-800">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === tab.id ? 'text-indigo-400' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-t-full" />
                )}
              </button>
            ))}
          </div>

          {/* Form Content */}
          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8">
            
            {activeTab === 'general' && (
              <form onSubmit={saveName} className="space-y-6">
                <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-4">Organization Profile</h3>
                <div className="space-y-2 max-w-md">
                  <label htmlFor="org-name" className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Organization name</label>
                  <input
                    id="org-name"
                    value={name ?? ''}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={data ? '' : 'Loading…'}
                    maxLength={120}
                    className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-lg px-4 py-2 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <p className="text-xs text-zinc-500">Shown on billing and reports.</p>
                </div>
                <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
                  <button type="submit" disabled={saving || !name?.trim() || name.trim() === data?.organization.name} className="btn-primary">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save changes
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-zinc-900 dark:text-white">Security status</h3>
                  <p className="text-sm text-zinc-500 mt-1">Read live from this server&apos;s configuration.</p>
                </div>
                {!data ? (
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                ) : (
                  <ul className="space-y-3">
                    <StatusRow
                      ok={!data.security.demoLogin}
                      title={data.security.demoLogin ? 'Demo login is ON' : 'Demo login is off'}
                      detail={data.security.demoLogin
                        ? 'Anyone can sign in as the demo accounts. The demo admin is read-only, but turn this off for a real school: remove DEMO_LOGIN_ENABLED in Cloudflare → universe-web → Settings → Variables and secrets.'
                        : 'Only real accounts can sign in.'}
                    />
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
                <RecentSignIns />
                <AccountSecurity />
                      <DownloadMyData />
                      <DeleteAccount />
                <Link href="/admin/audit" className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-500 hover:text-indigo-400">
                  See who changed what in the Activity Log →
                </Link>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-4">Notifications</h3>
                <EmailNotificationsSwitch />
                <LowDataToggle />
                <p className="text-sm text-zinc-500">
                  As an admin you&apos;re also notified (in the app, and by email when this is on) about every new teacher or NGO application, so you can review it in Approvals.
                </p>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
