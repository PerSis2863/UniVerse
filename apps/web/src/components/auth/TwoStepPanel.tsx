'use client';

import { useEffect, useRef, useState } from 'react';
import { Fingerprint, Loader2, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { passkeyError, passkeysSupported, passkeyTwoStep } from '@/lib/passkey-client';

/**
 * Second sign-in step for admins and the owner: their passkey when they have one on this device
 * (no email sent), otherwise a 6-digit code we email; either gives this device a pass for this
 * sign-in (see src/server/two-step.ts).
 */
export function TwoStepPanel({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState<'send' | 'verify' | 'passkey' | null>(null);
  const [error, setError] = useState('');
  // null while checking; true: offer the passkey first (the email only when asked).
  const [withPasskey, setWithPasskey] = useState<boolean | null>(null);
  const sent = useRef(false);

  const confirmWithPasskey = async () => {
    setBusy('passkey');
    setError('');
    try {
      localStorage.setItem('uv-pass', await passkeyTwoStep());
      onDone();
    } catch (e) {
      setError(passkeyError(e));
      setBusy(null);
    }
  };

  const send = async () => {
    setBusy('send');
    setError('');
    try {
      const { data } = await api.post<{ sentTo: string }>('/auth/two-step/send');
      setSentTo(data.sentTo);
    } catch (e) {
      setError((e as Error).message || 'The code could not be sent. Try again.');
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void (async () => {
      const { data } = await api.get<{ passkeys?: number }>('/auth/two-step').catch(() => ({ data: { passkeys: 0 } }));
      const passkey = !!data.passkeys && passkeysSupported();
      setWithPasskey(passkey);
      if (!passkey) void send();
    })();
  }, []);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('verify');
    setError('');
    try {
      const { data } = await api.post<{ pass: string }>('/auth/two-step/verify', { code });
      localStorage.setItem('uv-pass', data.pass);
      onDone();
    } catch (err) {
      setError((err as Error).message || 'That code did not work.');
      setBusy(null);
    }
  };

  if (withPasskey === null) return <div className="h-48 rounded-2xl skeleton" role="status" aria-label="Loading" />;
  if (withPasskey) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Fingerprint className="w-5 h-5 text-white" />
          </span>
          <div>
            <h2 className="text-xl font-bold text-white">Confirm it’s you</h2>
            <p className="text-sm text-zinc-400">Use your passkey: this device’s fingerprint, face or PIN.</p>
          </div>
        </div>
        {error && <div role="alert" className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-sm">{error}</div>}
        <button type="button" onClick={() => void confirmWithPasskey()} disabled={!!busy} autoFocus className="btn-primary w-full">
          {busy === 'passkey' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />} Use your passkey
        </button>
        <div className="flex items-center justify-between text-sm">
          <button type="button" onClick={() => { setError(''); setWithPasskey(false); void send(); }} disabled={!!busy} className="text-indigo-300 hover:text-indigo-200 disabled:opacity-50">Email me a code instead</button>
          <button type="button" onClick={onCancel} className="text-zinc-400 hover:text-white">Use another account</button>
        </div>
        <p className="text-xs text-zinc-500">Admin and owner accounts need this extra step each time they sign in, so a stolen password alone can&apos;t get in.</p>
      </div>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <ShieldCheck className="w-5 h-5 text-white" />
        </span>
        <div>
          <h2 className="text-xl font-bold text-white">Check your email</h2>
          <p className="text-sm text-zinc-400">{sentTo ? `We sent a 6-digit code to ${sentTo}.` : 'Sending you a 6-digit code…'}</p>
        </div>
      </div>
      {error && <div role="alert" className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-sm">{error}</div>}
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        placeholder="123456"
        aria-label="Sign-in code"
        className="w-full text-center text-2xl tracking-[0.5em] font-bold py-3 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-400"
      />
      <button type="submit" disabled={code.length !== 6 || !!busy} className="btn-primary w-full">
        {busy === 'verify' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Finish signing in'}
      </button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={() => void send()} disabled={!!busy} className="text-indigo-300 hover:text-indigo-200 disabled:opacity-50">
          {busy === 'send' ? 'Sending…' : 'Send a new code'}
        </button>
        <button type="button" onClick={onCancel} className="text-zinc-400 hover:text-white">Use another account</button>
      </div>
      <p className="text-xs text-zinc-500">Admin and owner accounts need this extra step each time they sign in, so a stolen password alone can&apos;t get in.</p>
    </form>
  );
}
