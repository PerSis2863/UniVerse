'use client';

import { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { appById, type AppId } from '@/lib/apps';
import { cn } from '@/lib/utils';

// "Invite someone" (M26, the first real users): the phone's share sheet where there is one, else
// WhatsApp's free share link (no paid messaging), and a copy button. The link opens sign-up on the
// app's tab (?app=), so a friend lands where the invite was about.

export function InviteButton({ app, text, label = 'Invite someone', className }: { app?: AppId; text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const url = () => `${window.location.origin}/register${app ? `?app=${app}` : ''}`;
  const share = async () => {
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ title: app ? appById(app).name : 'UniVerse Impact', text, url: url() }); } catch { /* closed the share sheet */ }
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url()}`)}`, '_blank', 'noopener,noreferrer');
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url()); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <button type="button" onClick={() => void share()} className="btn-primary btn-sm"><Share2 className="w-4 h-4" aria-hidden />{label}</button>
      <button type="button" onClick={() => void copy()} className="btn-secondary btn-sm">{copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}{copied ? 'Copied' : 'Copy link'}</button>
    </span>
  );
}
