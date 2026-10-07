'use client';

import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { BadgeCheck, CalendarClock, Clock, Globe2, HandHeart, MapPin, Users, Video } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, impactTabs } from '@/components/layout/SectionTabs';
import { authedJson } from '@/lib/authed-fetch';
import { fadeUp, list } from '@/lib/motion';
import { useAuthStore } from '@/store/auth';

// Impact rooms (Stage 4 · 4.12): every NGO project's room, the ones I follow first. A tab of
// Opportunities (students), Impact reports (admins) and NGO mentorship (teachers).

interface Room {
  id: string; name: string; description: string; location: string | null; sdgNumber: number | null; isPublic: boolean;
  ngo: { name: string; logoUrl: string | null; isVerified: boolean };
  followers: number; following: string | null; hours: number; volunteers: number; shifts: number;
  nextCall: { startsAt: string; title: string; open: boolean } | null;
}

const ROLE_LABEL: Record<string, string> = { VOLUNTEER: 'Volunteer', SPONSOR: 'Sponsor', SUPPORTER: 'Supporter' };

export default function ImpactRoomsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const { data, error } = useSWR<{ rooms: Room[]; staff: boolean }>('/api/impact-rooms', authedJson);
  return (
    <>
      <Topbar title="Impact rooms" subtitle="Where volunteers, sponsors and students meet around each NGO project" />
      <SectionTabs tabs={impactTabs(role)} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {error ? <p className="text-sm text-rose-500">{(error as Error).message}</p>
            : !data ? <div className="grid md:grid-cols-2 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-44 rounded-2xl skeleton" />)}</div>
            : data.rooms.length === 0 ? (
              <div className={`panel p-8 text-center`}>
                <Globe2 className="w-8 h-8 mx-auto text-indigo-500" />
                <p className="mt-3 font-semibold text-zinc-900 dark:text-white">No NGO projects yet</p>
                <p className="text-sm text-zinc-500 mt-1">Each active NGO project gets a room here.</p>
              </div>
            ) : (
              <motion.ul variants={list} initial="hidden" animate="show" className="grid md:grid-cols-2 gap-4">
                {data.rooms.map((r) => (
                  <motion.li key={r.id} variants={fadeUp}>
                    <Link href={`/impact-rooms/${r.id}`} className={`panel p-4 flex flex-col gap-3 h-full hover:border-indigo-400/60 transition-colors`}>
                      <div className="flex items-start gap-3">
                        <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-indigo-500 text-white flex items-center justify-center shrink-0 overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element -- an NGO's logo link; next/image can't optimise on Workers */}
                          {r.ngo.logoUrl ? <img src={r.ngo.logoUrl} alt="" className="w-full h-full object-cover" /> : <HandHeart className="w-5 h-5" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span data-shared={`impact-room:${r.id}`} className="block font-semibold text-zinc-900 dark:text-white truncate">{r.name}</span>
                          <span className="flex items-center gap-1 text-xs text-zinc-500 truncate">{r.ngo.name}{r.ngo.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}{r.location && <><MapPin className="w-3 h-3 ml-1 shrink-0" />{r.location}</>}</span>
                        </span>
                        {r.following && <span className="text-[10px] font-bold uppercase rounded-full px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">{ROLE_LABEL[r.following] ?? 'Following'}</span>}
                      </div>
                      <p className="text-sm text-zinc-600 dark:text-zinc-300 line-clamp-2">{r.description}</p>
                      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                        <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{r.hours} h verified</span>
                        <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{r.followers} following</span>
                        {r.sdgNumber && <span>SDG {r.sdgNumber}</span>}
                        {r.isPublic && <span className="inline-flex items-center gap-1"><Globe2 className="w-3.5 h-3.5" />Public page</span>}
                      </div>
                      {r.nextCall && (
                        <p className={r.nextCall.open ? 'text-xs font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1.5' : 'text-xs text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1.5'}>
                          {r.nextCall.open ? <Video className="w-3.5 h-3.5" /> : <CalendarClock className="w-3.5 h-3.5" />}
                          {r.nextCall.open ? 'Impact call happening now' : `Impact call ${new Date(r.nextCall.startsAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                        </p>
                      )}
                    </Link>
                  </motion.li>
                ))}
              </motion.ul>
            )}
        </div>
      </div>
    </>
  );
}
