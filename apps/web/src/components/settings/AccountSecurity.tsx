'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BadgeCheck, KeyRound, Loader2, LogOut, MailWarning, ShieldCheck } from 'lucide-react';
import { authErrorMessage } from '@/lib/auth-errors';

type Info = { email: string | null; verified: boolean; providers: string[] } | null;
const PROVIDER: Record<string, string> = { 'google.com': 'Google', 'apple.com': 'Apple', password: 'Email and password', phone: 'Phone number' };

/** Settings → Privacy & Security: how you sign in, email verification, password change, sign out. */
export function AccountSecurity() {
  // Demo and LMS sessions have no Firebase account (null); otherwise loaded below (undefined = loading).
  const [info, setInfo] = useState<Info | undefined>(() => {
    try { const t = localStorage.getItem('accessToken') ?? ''; return t.startsWith('mock-token-') || t.startsWith('ut1.') ? null : undefined; } catch { return undefined; }
  });
  const [pw, setPw] = useState<{ current: string; next: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (info === null) return;
    (async () => {
      const { auth } = await import('@/lib/firebase');
      await auth.authStateReady();
      const u = auth.currentUser;
      if (!cancelled) setInfo(u ? { email: u.email, verified: u.emailVerified, providers: u.providerData.map((p) => p.providerId) } : null);
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once

  const resend = async () => {
    setBusy(true);
    try {
      const [{ auth }, { sendEmailVerification }] = await Promise.all([import('@/lib/firebase'), import('firebase/auth')]);
      if (auth.currentUser) await sendEmailVerification(auth.currentUser);
      toast.success('Verification email sent');
    } catch (e) { toast.error(authErrorMessage(e, 'Couldn’t send the email.')); } finally { setBusy(false); }
  };
  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw) return;
    if (pw.next.length < 8) { toast.error('Use at least 8 characters.'); return; }
    setBusy(true);
    try {
      const [{ auth }, { EmailAuthProvider, reauthenticateWithCredential, updatePassword }] = await Promise.all([import('@/lib/firebase'), import('firebase/auth')]);
      const u = auth.currentUser;
      if (!u?.email) throw new Error('Please sign in again.');
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, pw.current)); // proves it's really you
      await updatePassword(u, pw.next);
      toast.success('Password changed');
      setPw(null);
    } catch (e) { toast.error(authErrorMessage(e, 'Couldn’t change the password.')); } finally { setBusy(false); }
  };
  const sendReset = async () => {
    try {
      const [{ auth }, { sendPasswordResetEmail }] = await Promise.all([import('@/lib/firebase'), import('firebase/auth')]);
      if (!auth.currentUser?.email) return;
      await sendPasswordResetEmail(auth, auth.currentUser.email);
      toast.success('Password reset email sent', { description: `Check ${auth.currentUser.email} for the link.` });
    } catch (e) { toast.error(authErrorMessage(e, 'Couldn’t send the reset email.')); }
  };
  const signOut = async () => {
    try { const { auth } = await import('@/lib/firebase'); await auth.signOut(); } catch { /* not a Firebase session */ }
    try { localStorage.removeItem('accessToken'); localStorage.removeItem('universe-auth'); sessionStorage.clear(); } catch { /* ignore */ }
    location.href = '/login';
  };

  if (info === undefined) return <div className="h-24 rounded-2xl skeleton" />;
  const inputCls = 'w-full rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40';
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-white/10 p-5 space-y-4">
      <p className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-500" /> Account security</p>
      {info ? (
        <>
          <div className="text-sm text-zinc-600 dark:text-zinc-300">
            <p>Signed in with <b>{info.providers.map((p) => PROVIDER[p] ?? p).join(', ') || 'UniVerse'}</b></p>
            {info.email && (
              <p className="mt-1 flex items-center gap-1.5">
                {info.verified ? <BadgeCheck className="w-4 h-4 text-emerald-500" /> : <MailWarning className="w-4 h-4 text-amber-500" />}
                {info.email} — {info.verified ? 'verified' : 'not verified'}
                {!info.verified && <button onClick={resend} aria-busy={busy || undefined} disabled={busy} className="ml-1 font-semibold text-indigo-600 dark:text-indigo-300 hover:underline">Send link</button>}
              </p>
            )}
          </div>
          {info.providers.includes('password') && (pw ? (
            <form onSubmit={changePassword} className="grid sm:grid-cols-2 gap-2">
              <input type="password" autoComplete="current-password" placeholder="Current password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className={inputCls} required />
              <input type="password" autoComplete="new-password" placeholder="New password (8+ characters)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className={inputCls} required minLength={8} />
              <div className="sm:col-span-2 flex gap-2">
                <button aria-busy={busy || undefined} disabled={busy} className="btn-primary">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Change password</button>
                <button type="button" onClick={() => setPw(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-500">Cancel</button>
                <button type="button" onClick={sendReset} className="ml-auto text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:underline">Forgot it? Email me a reset link</button>
              </div>
            </form>
          ) : (
            <button onClick={() => setPw({ current: '', next: '' })} className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm font-semibold text-zinc-700 dark:text-zinc-200 inline-flex items-center gap-2"><KeyRound className="w-4 h-4" /> Change password</button>
          ))}
        </>
      ) : <p className="text-sm text-zinc-500">This session is managed by your organization (LMS or demo), so there’s no password to manage here.</p>}
      <button onClick={signOut} className="text-sm font-semibold text-zinc-500 hover:text-rose-500 inline-flex items-center gap-1.5"><LogOut className="w-4 h-4" /> Sign out on this device</button>
    </div>
  );
}
