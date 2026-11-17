'use client';

import useSWR from 'swr';
import { Building2, Globe2, Lock, Users } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import Link from '@/components/ui/Link';

// M199: Admin → Safety → Who can see what. The words describe what the code does (school-scope.ts and
// the notes M158–M199); the numbers are this school's, live.
interface Visibility { everyone: boolean; schools: string[]; kept: Record<'students' | 'teachers' | 'parents' | 'admins' | 'courses' | 'rooms' | 'buildings', number>; ownPolicy: boolean }

const ROLES: [string, string, string][] = [
  ['Students', 'Their own work, grades and attendance; their courses’ materials and announcements; the names of students at your school.', 'Other students’ grades, work or attendance.'],
  ['Teachers', 'The courses they teach or co-teach: the students in them, their work, grades and attendance.', 'Courses they don’t teach.'],
  ['Parents', 'Only the children linked to them: grades, attendance, deadlines, report cards. Messages with the child’s teachers if your Policy allows it.', 'Any other child.'],
  ['Admins (you)', 'Everyone at your school and what they do in UniVersity: people, courses, grades, the activity log, exports.', 'Anyone or anything at another school.'],
  ['UniVerse’s owner', 'Every school, to keep the service running and answer support requests.', 'Private chats (encrypted on people’s devices).'],
];

const SHARED: [string, string][] = [
  ['Direct messages', 'Anyone signed in can start a chat with a person they know, because people in Trace, Relief, Green and Play have no school. The chat safety check still watches every chat with your students.'],
  ['The Impact League', 'Schools are compared by their totals.'],
  ['Trace, Relief, Green and Play', 'Open to everyone with an account. Places on their maps are rounded, so no one can be found.'],
  ['Links people choose to share', 'A certificate’s check page, Create work shared by link, a product’s passport.'],
];

const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function WhoSeesWhat() {
  const { data } = useSWR<Visibility>('/api/admin/visibility', authedJson);
  const k = data?.kept;
  const kept: [string, string][] = [
    ['People', k ? [n(k.students, 'student'), n(k.teachers, 'teacher'), n(k.parents, 'parent'), n(k.admins, 'admin')].join(', ') : '…'],
    ['Courses, work and grades', k ? n(k.courses, 'course') : '…'],
    ['Timetable, rooms and bookings', k ? n(k.rooms, 'room') : '…'],
    ['Campus map and campus info', k ? n(k.buildings, 'building') : '…'],
    ['Safety settings', data ? (data.ownPolicy ? 'Your school’s own' : 'The safe defaults, until you change them') : '…'],
    ['Clubs, broadcasts, sticker packs, chat safety flags, the activity log, exports and LMS connections', 'Your school’s only'],
  ];
  return (
    <div className="flex-1 p-4 md:p-8 overflow-y-auto">
      <div className="max-w-[2000px] space-y-6">
        <section className="panel p-5" aria-labelledby="wsw-roles">
          <h2 id="wsw-roles" className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-white"><Users className="w-4 h-4" aria-hidden />Who sees what</h2>
          {/* Phones: one block per role; wider screens: the table. */}
          <dl className="mt-3 space-y-3 sm:hidden">
            {ROLES.map(([who, sees, never]) => (
              <div key={who} className="text-sm"><dt className="font-semibold text-zinc-900 dark:text-white">{who}</dt><dd className="text-zinc-700 dark:text-zinc-300">Sees: {sees}</dd><dd className="text-zinc-700 dark:text-zinc-300">Never: {never}</dd></div>
            ))}
          </dl>
          <div className="mt-3 hidden sm:block">
            <table className="w-full text-sm">
              <thead><tr className="text-start text-xs text-zinc-500 dark:text-zinc-400"><th scope="col" className="text-start py-2 pe-4 font-medium">Who</th><th scope="col" className="text-start py-2 pe-4 font-medium">Sees</th><th scope="col" className="text-start py-2 font-medium">Never sees</th></tr></thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
                {ROLES.map(([who, sees, never]) => (
                  <tr key={who} className="align-top"><th scope="row" className="text-start py-2.5 pe-4 font-semibold text-zinc-900 dark:text-white whitespace-nowrap">{who}</th><td className="py-2.5 pe-4 text-zinc-700 dark:text-zinc-300">{sees}</td><td className="py-2.5 text-zinc-700 dark:text-zinc-300">{never}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="panel p-5" aria-labelledby="wsw-kept">
            <h2 id="wsw-kept" className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-white"><Lock className="w-4 h-4" aria-hidden />Kept to your school</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{data?.everyone ? 'You see every school (UniVerse’s owner).' : data ? `${data.schools.join(' and ')}: another school’s admins, teachers and students can’t see any of this.` : ' '}</p>
            <dl className="mt-3 divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {kept.map(([what, n]) => <div key={what} className="py-2 flex flex-wrap justify-between gap-x-4 gap-y-0.5 text-sm"><dt className="text-zinc-800 dark:text-zinc-200">{what}</dt><dd className="text-zinc-600 dark:text-zinc-400">{n}</dd></div>)}
            </dl>
            <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400"><Building2 className="inline w-3.5 h-3.5 me-1 -mt-0.5" aria-hidden />Safety settings are on the <Link href="/admin/safety/policy" className="underline">Policy</Link> tab.</p>
          </section>
          <section className="panel p-5" aria-labelledby="wsw-shared">
            <h2 id="wsw-shared" className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-white"><Globe2 className="w-4 h-4" aria-hidden />Shared between schools, on purpose</h2>
            <dl className="mt-3 space-y-3">
              {SHARED.map(([what, why]) => <div key={what}><dt className="text-sm font-medium text-zinc-900 dark:text-white">{what}</dt><dd className="text-sm text-zinc-600 dark:text-zinc-400">{why}</dd></div>)}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
