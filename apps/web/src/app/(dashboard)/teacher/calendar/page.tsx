'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Clock, Download, X, Plus, Loader2 } from 'lucide-react';
import { useState, useMemo, useEffect, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { m as motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { downloadIcs } from '@/components/dashboard/CourseBoard';
import { CalendarFeedCard } from '@/components/dashboard/CalendarFeedCard';
import { TimeGrid, timeRange, type GridEntry } from '@/components/calendar/TimeGrid';
import { toEntries, type Slot, type CalEvent } from '@/components/calendar/entries';
import type { ClassData } from '@/components/dashboard/ClassDetailModal';

// True once the page runs in the browser (false while rendering on the server), without an effect.
const noSubscribe = () => () => {};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function TeacherCalendarPage() {
  const [showOfficeModal, setShowOfficeModal] = useState(false);
  const [officeDay, setOfficeDay] = useState('Wednesday');
  const [officeTime, setOfficeTime] = useState('14:00');
  const [officeDuration, setOfficeDuration] = useState('60');
  const [officeLocation, setOfficeLocation] = useState('Room 301');
  const [savingOffice, setSavingOffice] = useState(false);
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);

  const [timetableSlots, setTimetableSlots] = useState<Slot[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Weekly classes repeat for the next 16 weeks; one-off events (office hours etc.) are exported as-is.
  const exportIcs = () => {
    if (!timetableSlots.length && !calendarEvents.length) return void toast.info('Nothing to export yet — your classes and events will appear here first.');
    const pad = (n: number) => String(n).padStart(2, '0');
    const local = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const esc = (v: string) => v.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UniVerse//Teaching Timetable//EN', 'CALSCALE:GREGORIAN'];
    const today = new Date();
    for (const slot of timetableSlots) {
      const first = new Date(today);
      const jsDay = (slot.dayOfWeek + 1) % 7; // 0=Mon in our data, 0=Sun in JS
      first.setDate(today.getDate() + ((jsDay - today.getDay() + 7) % 7));
      const [sh, sm] = String(slot.startTime).split(':').map(Number);
      const [eh, em] = String(slot.endTime).split(':').map(Number);
      const start = new Date(first); start.setHours(sh, sm, 0, 0);
      const end = new Date(first); end.setHours(eh, em, 0, 0);
      lines.push('BEGIN:VEVENT', `UID:slot-${slot.id}@universe`, `DTSTAMP:${utc(today)}`, `DTSTART:${local(start)}`, `DTEND:${local(end)}`, 'RRULE:FREQ=WEEKLY;COUNT=16',
        `SUMMARY:${esc(`${slot.course?.code ?? ''} ${slot.course?.name ?? 'Class'}`.trim())}`, ...(slot.room?.name ? [`LOCATION:${esc(slot.room.name)}`] : []), 'END:VEVENT');
    }
    for (const e of calendarEvents) {
      lines.push('BEGIN:VEVENT', `UID:event-${e.id}@universe`, `DTSTAMP:${utc(today)}`, `DTSTART:${utc(new Date(e.startAt))}`, `DTEND:${utc(new Date(e.endAt))}`,
        `SUMMARY:${esc(e.title)}`, ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []), 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    downloadIcs(lines.join('\r\n'), 'teaching-timetable.ics');
    toast.success('Calendar file downloaded', { description: 'Open it to add your classes to Google, Apple or Outlook Calendar.' });
  };

  // Loads once, when the page opens.
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get('/timetable/my'), api.get('/calendar/my')])
      .then(([slotsRes, eventsRes]) => {
        if (cancelled) return;
        setTimetableSlots(slotsRes.data || []);
        setCalendarEvents(eventsRes.data || []);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to fetch schedule data:', error);
        toast.error('Could not load schedule');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSaveOfficeHours = async () => {
    setSavingOffice(true);
    try {
      // Find the next date that matches the officeDay
      const dayIndex = DAYS.indexOf(officeDay);
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + ((dayIndex + 1 + 7 - targetDate.getDay()) % 7));
      
      const [hours, minutes] = officeTime.split(':').map(Number);
      targetDate.setHours(hours, minutes, 0, 0);
      
      const endDate = new Date(targetDate.getTime() + parseInt(officeDuration) * 60000);

      const res = await api.post('/calendar', {
        title: 'Office Hours',
        description: officeLocation,
        startAt: targetDate.toISOString(),
        endAt: endDate.toISOString(),
        type: 'MEETING',
        color: '#71717a'
      });
      
      setCalendarEvents(prev => [...prev, res.data]);
      setShowOfficeModal(false);
      toast.success('Office hours added!', { description: `${officeDay} at ${officeTime} for ${officeDuration} mins in ${officeLocation}` });
    } catch (error) {
      console.error('Failed to add office hours:', error);
      toast.error('Could not save office hours');
    } finally {
      setSavingOffice(false);
    }
  };

  const entries = useMemo(() => toEntries(timetableSlots, calendarEvents), [timetableSlots, calendarEvents]);
  // A class opens its course on Blackboard; an event without a course shows its details.
  const openEntry = (e: GridEntry<ClassData>) => {
    if (e.data.courseId) return router.push(`/teacher/blackboard?course=${e.data.courseId}`);
    toast(e.title, { description: `${timeRange(e.start, e.end)}${e.location ? ` · ${e.location}` : ''}` });
  };

  return (
    <>
      <Topbar 
        title="Teaching Timetable" 
        subtitle="Manage your classes and office hours" 
        rightNode={
          <button className="btn-primary" onClick={exportIcs}>
            <Download className="w-4 h-4" /> Export
          </button>
        }
      />
      
      <div className="flex-1 p-4 sm:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <TimeGrid
            label="Your teaching timetable"
            entries={entries}
            loading={loading}
            onOpen={openEntry}
            toolbarEnd={
              <button type="button" onClick={() => setShowOfficeModal(true)} className="btn-secondary w-full sm:w-auto sm:ml-auto">
                <Plus className="w-4 h-4" /> Office hours
              </button>
            }
          />

          <CalendarFeedCard who="teacher" />
        </div>
      </div>
      {mounted && createPortal(
        <AnimatePresence>
          {showOfficeModal && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && setShowOfficeModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
              >
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-bold text-zinc-900 dark:text-white text-lg flex items-center gap-2">
                    <Clock className="w-5 h-5 text-indigo-500" /> Add Office Hours
                  </h3>
                  <button aria-label="Close" onClick={() => setShowOfficeModal(false)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Day</label>
                    <select aria-label="Day" value={officeDay} onChange={e => setOfficeDay(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500">
                      {['Monday','Tuesday','Wednesday','Thursday','Friday'].map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Start Time</label>
                      <input type="time" value={officeTime} onChange={e => setOfficeTime(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 [color-scheme:dark]" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Duration (mins)</label>
                      <select aria-label="Duration (mins)" value={officeDuration} onChange={e => setOfficeDuration(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500">
                        {['30','60','90','120'].map(d => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Location / Room</label>
                    <input type="text" value={officeLocation} onChange={e => setOfficeLocation(e.target.value)} placeholder="e.g. Room 301 or Online" className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 placeholder:text-zinc-400" />
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={() => setShowOfficeModal(false)} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
                  <button onClick={handleSaveOfficeHours} aria-busy={savingOffice || undefined} disabled={savingOffice} className="flex-1 btn-primary py-2.5 text-sm flex items-center justify-center gap-2">
                    {savingOffice ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                    ) : (
                      <><Plus className="w-4 h-4" /> Add Office Hours</>
                    )}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
