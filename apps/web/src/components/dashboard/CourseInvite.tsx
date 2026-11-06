'use client';

import { useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Globe, Link2, Loader2 } from 'lucide-react';
import { InviteButton } from '@/components/apps/InviteButton';
import { api, errorMessage } from '@/lib/api';
import { inviteHref } from '@/lib/course-invite';

// M113 (the council: one real class first): the link a teacher sends their class. It opens the join
// card (/join?course=<id>, CourseJoin.tsx): each student makes an account, which opens straight away,
// and joins with one tap. A draft course can't be joined, so this offers to publish it first.

const noop = () => () => {};

export function CourseInviteLink({ course, onPublished }: { course: { id: string; code: string; name: string; status?: string | null }; onPublished?: () => void }) {
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => '');
  const [busy, setBusy] = useState(false);
  const href = inviteHref(course.id);
  const publish = async () => {
    setBusy(true);
    try {
      await api.patch(`/courses/${course.id}`, { status: 'PUBLISHED' });
      toast.success('Published: your students can join now');
      onPublished?.();
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t publish it. Try again.'));
    } finally {
      setBusy(false);
    }
  };
  if (course.status && course.status !== 'PUBLISHED') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Students can join once the course is published. Until then only you and your teaching team see it.</p>
        <button type="button" onClick={() => void publish()} disabled={busy} className="btn-primary btn-sm">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Globe className="w-4 h-4" aria-hidden />}Publish {course.code}
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">Send this link to your class (WhatsApp, email or on the board). Each student makes a free account, which opens straight away, and joins with one tap.</p>
      <p className="flex items-center gap-2 rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-3 py-2 font-mono text-xs text-zinc-700 dark:text-zinc-200 break-all" translate="no">
        <Link2 className="w-3.5 h-3.5 shrink-0" aria-hidden />{origin}{href}
      </p>
      <InviteButton href={href} text={`Join ${course.code} · ${course.name} on UniVersity:`} label="Share the link" />
    </div>
  );
}
