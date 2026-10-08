'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, SUPPORT_TABS } from '@/components/layout/SectionTabs';
import { AlertTriangle, ShieldAlert, Phone, Send, Info, Loader2, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '@/lib/api';

// The kind of concern → how urgently admins should look at it (they're alerted for every report).
const INCIDENT_TYPES: { label: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' }[] = [
  { label: 'Bullying or harassment', severity: 'HIGH' },
  { label: 'Suspicious activity', severity: 'HIGH' },
  { label: 'Theft or property damage', severity: 'MEDIUM' },
  { label: 'Facilities or maintenance hazard', severity: 'MEDIUM' },
  { label: 'Academic integrity violation', severity: 'LOW' },
  { label: 'Other / not sure', severity: 'MEDIUM' },
];

const RESOURCES = [
  { href: '/student/support', label: 'Talk to the support team' },
  { href: '/student/life/medical', label: 'Health & wellness, emergency contacts' },
  { href: '/student/information', label: 'School links and services' },
];

// Campus security's number (NEXT_PUBLIC_CAMPUS_SECURITY_PHONE); the national emergency number otherwise.
const SECURITY_PHONE = process.env.NEXT_PUBLIC_CAMPUS_SECURITY_PHONE || '112';

const EMERGENCY_NUMBERS: Record<string, string> = {
  US: '911', CA: '911', GB: '999', AU: '000', 
  NZ: '111', IN: '112', CN: '110', JP: '119',
  ZA: '10111', BR: '190', MX: '911', KR: '112'
};

const EU_COUNTRIES = ['FR', 'DE', 'IT', 'ES', 'NL', 'BE', 'SE', 'DK', 'FI', 'NO', 'AT', 'CH', 'IE', 'PT', 'GR', 'PL', 'CZ', 'RO', 'HU'];

export default function BeeSafeReporting() {
  const [emergencyNumber, setEmergencyNumber] = useState('911');
  const [countryName, setCountryName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/geo')
      .then(res => res.json())
      .then((data: { countryCode: string | null }) => {
        const code = data.countryCode;
        if (code) {
          try {
            setCountryName(new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code);
          } catch {
            setCountryName(code);
          }
          if (EU_COUNTRIES.includes(code)) {
            setEmergencyNumber('112');
          } else {
            setEmergencyNumber(EMERGENCY_NUMBERS[code] || '911 (or local emergency number)');
          }
        }
      })
      .catch(() => {
        // Fallback silently on error
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Topbar title="BeeSafe Reporting" subtitle="Confidential platform for safety and incident reporting" />
      <SectionTabs tabs={SUPPORT_TABS} />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex gap-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-red-400 mb-1 flex items-center gap-2">
                  In an emergency, call {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : emergencyNumber} immediately.
                </h3>
                {countryName && !loading && (
                  <div className="text-xs text-red-300/80 mb-2">Detected region: {countryName}</div>
                )}
                <p className="text-sm text-red-300/80 max-w-xl">
                  This system is for non-emergency reporting. Reports submitted here are reviewed during regular business hours. For immediate on-campus assistance, contact Campus Security.
                </p>
              </div>
            </div>
            <a href={`tel:${SECURITY_PHONE.replace(/[^+\d]/g, '')}`} className="flex-shrink-0 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg font-bold transition-colors w-full md:w-auto">
              <Phone className="w-5 h-5" /> {process.env.NEXT_PUBLIC_CAMPUS_SECURITY_PHONE ? 'Call Campus Security' : `Call emergency (${SECURITY_PHONE})`}
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-6">
              
              <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8">
                <h3 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-indigo-400" /> Submit an Incident Report
                </h3>
                
                <ReportForm />
              </div>

            </div>

            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-4">Confidentiality Notice</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
                  The BeeSafe Reporting system is designed to provide a secure and confidential way for students, faculty, and staff to report concerns.
                </p>
                <div className="flex items-start gap-2 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 p-3 rounded-lg text-xs leading-relaxed">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  Reports go only to your school’s administrators. An anonymous report carries no name or contact details.
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-4">Other Resources</h3>
                <div className="space-y-3">
                  {RESOURCES.map((r) => (
                    <Link key={r.href} href={r.href} className="block p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors text-sm">
                      {r.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}



/** The incident report: sent to the school's admins (POST /api/core/safety/report). */
function ReportForm() {
  const [type, setType] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<null | { anonymous: boolean }>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const kind = INCIDENT_TYPES.find((t) => t.label === type);
    if (!kind) return toast.error('Choose the type of incident.');
    if (description.trim().length < 10) return toast.error('Please describe what happened (a sentence or two at least).');
    const when = [date && new Date(`${date}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }), time].filter(Boolean).join(' at ');
    setSending(true);
    try {
      await api.post('/safety/report', {
        title: kind.label,
        severity: kind.severity,
        location: location.trim() || undefined,
        description: `${when ? `When: ${when}\n\n` : ''}${description.trim()}`,
        isAnonymous: anonymous,
      });
      setSent({ anonymous });
    } catch (err) {
      toast.error((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Your report could not be sent. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center py-8 space-y-3" role="status">
        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
        <h4 className="text-lg font-semibold text-zinc-900 dark:text-white">Report sent</h4>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-md mx-auto">
          Your school&apos;s administrators have been alerted.{' '}
          {sent.anonymous ? 'It was sent without your name, so they can’t contact you about it.' : 'They may contact you if they need more details.'}
        </p>
        <button type="button" className="btn-secondary" onClick={() => { setSent(null); setType(''); setDate(''); setTime(''); setLocation(''); setDescription(''); setAnonymous(false); }}>
          Send another report
        </button>
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <div className="space-y-2">
        <label htmlFor="bs-type" className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Incident type</label>
        <select id="bs-type" required value={type} onChange={(e) => setType(e.target.value)} className={`input py-3 appearance-none`}>
          <option value="" disabled>Select an option…</option>
          {INCIDENT_TYPES.map((t) => <option key={t.label}>{t.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label htmlFor="bs-date" className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Date of incident</label>
          <input id="bs-date" type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className={`input dark:[color-scheme:dark]`} />
        </div>
        <div className="space-y-2">
          <label htmlFor="bs-time" className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Time of incident</label>
          <input id="bs-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`input dark:[color-scheme:dark]`} />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="bs-location" className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Location</label>
        <input id="bs-location" type="text" maxLength={300} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where did this happen? (e.g., Library 2nd Floor)" className="input" />
      </div>

      <div className="space-y-2">
        <label htmlFor="bs-desc" className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Detailed description</label>
        <textarea id="bs-desc" required rows={5} maxLength={4800} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Please provide as much detail as possible about what occurred, who was involved, and any witnesses..." className={`input py-3`} />
      </div>

      <div className="bg-zinc-100 dark:bg-zinc-800/30 border border-zinc-300/60 dark:border-zinc-700/50 rounded-lg p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="mt-1 flex-shrink-0" />
          <div>
            <div className="font-medium text-zinc-900 dark:text-white mb-1">Submit anonymously</div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Your name and contact information will not be attached to this report. Note that this may limit our ability to investigate or follow up with you.
            </div>
          </div>
        </label>
      </div>

      <button type="submit" className="btn-primary btn-lg w-full" disabled={sending} aria-busy={sending || undefined}>
        {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />} {sending ? 'Sending…' : 'Submit report securely'}
      </button>
    </form>
  );
}
