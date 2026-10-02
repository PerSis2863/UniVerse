'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { CalendarPlus, Check, Copy, Lock } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';

// "Add to your calendar" on the student and teacher calendar pages: subscribes Google, Apple or
// Outlook Calendar to the person's live feed (/api/calendar/<token>.ics), so it updates by itself.

const TEXT = {
  student: 'Your classes, quiz due dates, exams and deadlines',
  teacher: 'Your classes, your quizzes’ due dates and course events',
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
      <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z" />
      <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden>
      <path d="M16.4 12.6c0-2.5 2-3.7 2.1-3.8a4.6 4.6 0 0 0-3.6-2c-1.5-.2-3 .9-3.7.9-.8 0-2-.9-3.2-.8a4.8 4.8 0 0 0-4 2.4c-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4a10 10 0 0 0 1.3-2.8 4.3 4.3 0 0 1-2.5-3.7zM14 5.2A4.3 4.3 0 0 0 15 2a4.4 4.4 0 0 0-2.9 1.5 4.1 4.1 0 0 0-1 3.1c1.1.1 2.2-.6 2.9-1.4z" />
    </svg>
  );
}

export function CalendarFeedCard({ who }: { who: 'student' | 'teacher' }) {
  const { data, error } = useSWR<{ path: string }>('/api/calendar-link', authedJson, { revalidateOnFocus: false });
  const [copied, setCopied] = useState(false);

  const https = data ? `${window.location.origin}${data.path}` : '';
  const webcal = https.replace(/^https?:\/\//, 'webcal://');
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(https);
      setCopied(true);
      toast.success('Calendar link copied', { description: 'In Outlook or another calendar app, choose “Subscribe from web” or “Add from URL” and paste it.' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Couldn’t copy the link. Please try again.');
    }
  };

  return (
    <section className="rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-5 sm:p-6">
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-fuchsia-500/20 shrink-0">
            <CalendarPlus className="w-6 h-6 text-white" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Add to your calendar</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-0.5">
              {TEXT[who]}, in the calendar app on your phone or computer. It keeps itself up to date.
            </p>
            <p className="text-xs text-zinc-500 mt-2 flex items-start gap-1.5">
              <Lock className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>Keep this link to yourself: anyone who has it can see your schedule. Google Calendar can take a few hours to show changes.</span>
            </p>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-zinc-500">{(error as Error).message || 'Calendar links aren’t available right now.'}</p>
        ) : (
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            <a href={data ? google : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!data || undefined} className="btn-secondary min-h-11 px-4 sm:flex-1 aria-disabled:opacity-50 aria-disabled:pointer-events-none">
              <GoogleMark /> Add to Google Calendar
            </a>
            <a href={data ? webcal : undefined} aria-disabled={!data || undefined} className="btn-secondary min-h-11 px-4 sm:flex-1 aria-disabled:opacity-50 aria-disabled:pointer-events-none">
              <AppleMark /> Add to Apple Calendar
            </a>
            <button onClick={copy} disabled={!data} className="btn-primary min-h-11 px-4 sm:flex-1">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
