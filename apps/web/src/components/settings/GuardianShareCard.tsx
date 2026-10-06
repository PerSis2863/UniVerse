'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Check, Copy, EyeOff, Link2, Loader2, Share2, Users } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { cn } from '@/lib/utils';
import { TabPill } from '@/components/ui/Glide';

// Student settings → Parent or guardian: makes a read-only link to /guardian/<token>. The link
// carries its own expiry and isn't stored, so it can't be switched off early; the text says so.

const CHOICES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const;

export function GuardianShareCard() {
  const [days, setDays] = useState<number>(30);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const create = async () => {
    setBusy(true);
    try {
      const r = await authedJson<{ path: string; expiresAt: string }>('/api/student/guardian-link', { method: 'POST', body: JSON.stringify({ days }) });
      setLink({ url: `${window.location.origin}${r.path}`, expiresAt: r.expiresAt });
      setCopied(false);
    } catch (e) {
      toast.error((e as Error).message || 'Couldn’t make a link right now.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Couldn’t copy. Press and hold the link to copy it instead.');
    }
  };

  const share = async () => {
    if (!link) return;
    try {
      await navigator.share({ title: 'My progress on UniVerse', text: 'Here’s a link to see my grades, attendance and what’s coming up:', url: link.url });
    } catch { /* closed the share sheet */ }
  };

  return (
    <div className="rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-5 sm:p-6 space-y-5">
      <div className="flex items-start gap-4">
        <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-fuchsia-500/20 shrink-0">
          <Users className="w-6 h-6 text-white" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">Share progress with a parent or guardian</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1">
            Make a private link they can open without an account. They’ll see your first name, your courses with grades, your attendance, what’s coming up and recent achievements.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-zinc-500">
        <EyeOff className="w-4 h-4 shrink-0 mt-px" />
        <span>They can’t see your messages, contact details or anything else, and they can’t change anything.</span>
      </div>

      <div>
        <p id="guardian-days" className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Link works for</p>
        <div role="radiogroup" aria-labelledby="guardian-days" className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-zinc-100 dark:bg-white/[0.04] border border-zinc-200/70 dark:border-white/[0.06]">
          {CHOICES.map((c) => (
            <button
              key={c.days}
              role="radio"
              aria-checked={days === c.days}
              onClick={() => setDays(c.days)}
              className={cn('relative isolate', 
                'min-h-11 rounded-xl text-sm font-semibold transition-colors',
                days === c.days ? 'text-white' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white',
              )}
            >{days === c.days && <TabPill id="s-settings-guardiansharecard-0" />}
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <button onClick={create} disabled={busy} aria-busy={busy || undefined} className="btn-primary min-h-11 w-full sm:w-auto px-5">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
        {link ? 'Make a new link' : 'Create link'}
      </button>

      {link && (
        <div className="space-y-3 rounded-2xl bg-white/70 dark:bg-white/[0.04] border border-indigo-500/20 p-3 sm:p-4">
          <label htmlFor="guardian-link" className="text-xs font-semibold text-zinc-500">Your link</label>
          <input
            id="guardian-link"
            readOnly
            value={link.url}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full min-w-0 rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-3 py-2.5 font-mono text-xs text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={copy} className="btn-secondary min-h-11 flex-1">
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy link'}
            </button>
            {canShare && (
              <button onClick={share} className="btn-secondary min-h-11 flex-1">
                <Share2 className="w-4 h-4" /> Share
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            Works until <strong className="text-zinc-700 dark:text-zinc-200">{format(new Date(link.expiresAt), 'd MMMM yyyy')}</strong>. Anyone with the link can see this page until then, and it can’t be switched off early, so only send it to people you trust. If you’re not sure, pick 7 days.
          </p>
        </div>
      )}
    </div>
  );
}
