'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Building2, CalendarClock, ExternalLink, FileText, Link2, MessageSquare, Pencil } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import Link from '@/components/ui/Link';
import { Avatar } from '@/components/ui/Avatar';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { authedJson } from '@/lib/authed-fetch';
import { fadeUp, list } from '@/lib/motion';
import { useAuthStore } from '@/store/auth';

// Stage 5 · Q18: a person's profile (/people/<id>; old /student/profile/<name> links open it too):
// what they chose to show (cover, photo, pronouns, about, links, when they're free), their role and
// department, and what they shared publicly. Never their email or phone (src/server/profile.ts).

interface Profile {
  id: string; name: string; avatar: string | null; role: string; coverUrl: string | null; pronouns: string | null; bio: string | null;
  links: { label: string; url: string }[]; availability: string | null; memberSince: string; department: string | null; year: number | null; designation: string | null;
  shared: { id: string; title: string; url: string | null; category: string | null; createdAt: string }[];
}
const ROLE: Record<string, string> = { STUDENT: 'Student', TEACHER: 'Teacher', ADMIN: 'Staff', INDUSTRY_MENTOR: 'Mentor' };
const settingsFor = (role?: string) => (role === 'TEACHER' ? '/teacher/settings' : role === 'ADMIN' ? '/admin/settings' : '/student/settings');

export function ProfileView({ id }: { id: string }) {
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const { data: p, error } = useSWR<Profile>(`/api/profile/${encodeURIComponent(id)}`, authedJson);
  const message = async () => {
    try {
      const { id: c } = await authedJson<{ id: string }>('/api/chat/conversations', { method: 'POST', body: JSON.stringify({ userId: p!.id }) });
      router.push(`${me?.role === 'TEACHER' ? '/teacher' : me?.role === 'ADMIN' ? '/admin' : '/student'}/inbox?c=${encodeURIComponent(c)}`);
    } catch (e) { toast.error((e as Error).message || 'Couldn’t start the chat.'); }
  };
  const line = p && [ROLE[p.role] ?? 'Member', p.designation, p.department, p.year ? `Year ${p.year}` : null].filter(Boolean).join(' · ');
  return (
    <>
      <Topbar title={p?.name ?? 'Profile'} subtitle={p ? line ?? undefined : undefined} />
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-8 max-w-4xl mx-auto w-full min-w-0 space-y-5">
          {error ? <div className="panel p-6 text-center"><p className="font-semibold text-zinc-900 dark:text-white">Profile not found</p><p className="text-sm text-zinc-600 dark:text-zinc-400">This person may have left, or the link is wrong.</p></div>
            : !p ? <ContentSkeleton variant="list" />
            : (
              <motion.div variants={list} initial="hidden" animate="show" className="space-y-5">
                <motion.section variants={fadeUp} className="panel overflow-hidden" aria-labelledby="profile-name">
                  <div className="relative h-32 sm:h-44 bg-gradient-to-r from-indigo-500/30 to-fuchsia-500/30">
                    {p.coverUrl && <Image src={p.coverUrl} alt="" fill unoptimized sizes="(max-width: 896px) 100vw, 896px" className="object-cover" />}
                  </div>
                  <div className="px-4 sm:px-6 pb-5">
                    <div className="-mt-10 sm:-mt-12 flex flex-wrap items-end gap-3">
                      <div className="rounded-full ring-4 ring-white dark:ring-zinc-900 bg-white dark:bg-zinc-900"><Avatar name={p.name} src={p.avatar} size={88} /></div>
                      <span className="flex-1" />
                      {me?.id === p.id
                        ? <Link href={`${settingsFor(me?.role)}?section=profile`} className="btn-secondary btn-sm"><Pencil className="w-4 h-4" aria-hidden /> Edit profile</Link>
                        : <button type="button" className="btn-primary btn-sm" onClick={message}><MessageSquare className="w-4 h-4" aria-hidden /> Message</button>}
                    </div>
                    <h1 id="profile-name" className="mt-3 text-2xl font-black text-zinc-900 dark:text-white break-words">{p.name}{p.pronouns && <span className="ms-2 text-base font-medium text-zinc-600 dark:text-zinc-400">({p.pronouns})</span>}</h1>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5"><Building2 className="w-4 h-4 shrink-0" aria-hidden /> {line}</p>
                    {p.availability && <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200 flex items-start gap-1.5"><CalendarClock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {p.availability}</p>}
                    {p.bio && <p className="mt-3 text-[15px] text-zinc-800 dark:text-zinc-100 whitespace-pre-line break-words">{p.bio}</p>}
                    {p.links.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Links">
                        {p.links.map((l) => <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium bg-zinc-100 dark:bg-white/[0.06] text-zinc-800 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-white/10"><Link2 className="w-4 h-4" aria-hidden /> {l.label}<span className="sr-only"> (opens a new tab)</span></a></li>)}
                      </ul>
                    )}
                    {!p.bio && !p.links.length && !p.availability && me?.id === p.id && <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Add a few words about you, links and when you’re free in <Link href={`${settingsFor(me?.role)}?section=profile`} className="text-indigo-700 dark:text-indigo-300 underline underline-offset-2">Settings</Link>.</p>}
                    <p className="mt-3 text-xs text-zinc-500">On UniVerse since {new Date(p.memberSince).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
                  </div>
                </motion.section>
                <motion.section variants={fadeUp} className="panel" aria-labelledby="shared-h">
                  <h2 id="shared-h" className="font-bold text-zinc-900 dark:text-white p-4 pb-2">Shared resources</h2>
                  {p.shared.length ? (
                    <ul className="divide-y divide-zinc-200 dark:divide-white/10">
                      {p.shared.map((r) => (
                        <li key={r.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                          <FileText className="w-5 h-5 text-zinc-400 shrink-0" aria-hidden />
                          <span className="flex-1 min-w-0"><span className="block font-medium text-zinc-900 dark:text-white break-words">{r.title}</span><span className="text-xs text-zinc-600 dark:text-zinc-400">{r.category ?? 'General'} · {new Date(r.createdAt).toLocaleDateString()}</span></span>
                          {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm"><ExternalLink className="w-4 h-4" aria-hidden /> Open</a>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="px-4 pb-4 text-sm text-zinc-600 dark:text-zinc-400">Nothing shared publicly yet.</p>}
                </motion.section>
              </motion.div>
            )}
        </div>
      </div>
    </>
  );
}
