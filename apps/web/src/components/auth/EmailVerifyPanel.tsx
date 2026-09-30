'use client';

import { useEffect, useState } from 'react';
import { Loader2, MailCheck, RefreshCw } from 'lucide-react';
import { authErrorMessage } from '@/lib/auth-errors';

/**
 * "Check your inbox" step for email + password accounts: UniVerse only lets the account in once the
 * person has clicked the link Firebase emailed them, so nobody can sign up with someone else's
 * (or a made-up) address. Sends the email on mount when `sendOnMount` is set.
 */
export function EmailVerifyPanel({ email, sendOnMount, onVerified, onCancel }: {
  email: string;
  sendOnMount?: boolean;
  onVerified: (freshToken: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState<'check' | 'send' | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const send = async () => {
    setBusy('send'); setMessage(null);
    try {
      const [{ auth }, { sendEmailVerification }] = await Promise.all([import('@/lib/firebase'), import('firebase/auth')]);
      if (!auth.currentUser) throw new Error('Please sign in again.');
      await sendEmailVerification(auth.currentUser, { url: `${location.origin}/login` });
      setMessage({ kind: 'ok', text: `Verification email sent to ${email}.` });
      setCooldown(60);
    } catch (e) {
      setMessage({ kind: 'error', text: authErrorMessage(e, 'Couldn’t send the email. Please try again in a minute.') });
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    setBusy('check'); setMessage(null);
    try {
      const { auth } = await import('@/lib/firebase');
      const u = auth.currentUser;
      if (!u) throw new Error('Please sign in again.');
      await u.reload();
      if (!u.emailVerified) {
        setMessage({ kind: 'error', text: 'Not verified yet. Open the link in the email (check spam too), then try again.' });
        return;
      }
      await onVerified(await u.getIdToken(true)); // a fresh token carries email_verified = true
    } catch (e) {
      setMessage({ kind: 'error', text: authErrorMessage(e, 'Couldn’t check right now. Please try again.') });
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!sendOnMount) return;
    const t = setTimeout(() => void send(), 0);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  return (
    <div className="text-center">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center"><MailCheck className="w-7 h-7" /></div>
      <h2 className="mt-4 text-xl font-bold text-white">Verify your email</h2>
      <p className="mt-2 text-sm text-zinc-400">We sent a link to <span className="text-white font-medium">{email}</span>. Open it to confirm the address is yours, then come back here.</p>
      {message && <p role="status" className={`mt-4 text-sm ${message.kind === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>{message.text}</p>}
      <button onClick={check} disabled={!!busy} className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
        {busy === 'check' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} I’ve verified my email
      </button>
      <div className="mt-3 flex items-center justify-center gap-4 text-sm">
        <button onClick={send} disabled={!!busy || cooldown > 0} className="text-indigo-400 hover:text-indigo-300 disabled:text-zinc-600 inline-flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
        </button>
        <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-300">Use another account</button>
      </div>
    </div>
  );
}
