'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { CalendarDays } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { Segmented } from '@/components/ui/Segmented';
import { fetcher } from '@/lib/fetcher';
import { Register, useRegister } from '@/components/attendance/Register';
import { ExcuseRequests, SeatingChart } from '@/components/attendance/SeatingAndExcuses';
import { SectionTabs, TEACHER_MARKING_TABS } from '@/components/layout/SectionTabs';

// Attendance for a class (Stage 5 · Q11): the register (keyboard, everyone at once, from the class
// call), the seating chart, and excuse requests. ?course=<id>&tab=excuses opens a course's requests.

type Tab = 'register' | 'seating' | 'excuses';
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function TeacherAttendance() {
  const { data: courses } = useSWR<{ id: string; name: string; code?: string }[]>('/courses/my', fetcher);
  // Dashboard pages render only in the browser, so the address can be read straight away.
  const [picked, setPicked] = useState(() => new URLSearchParams(window.location.search).get('course') ?? '');
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).get('tab') === 'excuses' ? 'excuses' : 'register'));
  const [day, setDay] = useState(localDay);
  const list = Array.isArray(courses) ? courses : [];
  const courseId = list.some((c) => c.id === picked) ? picked : list[0]?.id ?? '';
  const { data, mutate } = useRegister(courseId, day);

  return (
    <>
      <Topbar title="Attendance" subtitle="Take the register, keep a seating chart and answer excuse requests" />
      <SectionTabs tabs={TEACHER_MARKING_TABS} />
      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-5xl mx-auto space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Class
              <select aria-label="Course" value={courseId} onChange={(e) => setPicked(e.target.value)} className="input mt-1 w-64 max-w-full">
                {list.map((c) => <option key={c.id} value={c.id}>{c.code ? `${c.code} · ` : ''}{c.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Day
              <span className="mt-1 flex items-center gap-2 input w-auto"><CalendarDays className="w-4 h-4 text-zinc-500" aria-hidden /><input type="date" aria-label="Day" value={day} max={localDay()} onChange={(e) => e.target.value && setDay(e.target.value)} className="bg-transparent outline-none" /></span>
            </label>
            <Segmented<Tab> label="Show" value={tab} onChange={setTab} className="ms-auto"
              segments={[{ value: 'register', label: 'Register' }, { value: 'seating', label: 'Seating' }, { value: 'excuses', label: data?.pendingExcuses ? `Excuses (${data.pendingExcuses})` : 'Excuses' }]} />
          </div>
          {!list.length && courses ? (
            <p className="py-10 text-center text-sm text-zinc-600 dark:text-zinc-400">You don’t teach a course yet.</p>
          ) : tab === 'register' ? (
            <Register courseId={courseId} day={day} data={data} mutate={() => mutate()} />
          ) : tab === 'seating' ? (
            data ? <SeatingChart courseId={courseId} day={day} data={data} mutate={() => mutate()} /> : <div className="h-60 rounded-2xl skeleton" />
          ) : (
            courseId && <ExcuseRequests courseId={courseId} onChanged={() => void mutate()} />
          )}
        </div>
      </div>
    </>
  );
}
