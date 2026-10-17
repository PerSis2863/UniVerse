'use client';

import useSWR from 'swr';
import { authedJson } from '@/lib/authed-fetch';
import { toMinutes, type Overlap } from '@/lib/schedule-solver';

// What the admin's timetable and exam generators work from (Stage 5 · Q12): GET /api/admin/timetable/plan.

export interface PlanCourseInfo { id: string; code: string; name: string; department: string | null; color: string | null; teacherId: string | null; teacher: string | null; students: number }
export interface PlanRoomInfo { id: string; name: string; capacity: number; type: string }
export interface PlanSlotInfo { id: string; courseId: string; dayOfWeek: number; startTime: string; endTime: string; roomId: string | null; type: string }
export interface ExamBatchInfo { batch: string; name: string; exams: number; from: string | null; to: string | null }
export interface PlanData { courses: PlanCourseInfo[]; rooms: PlanRoomInfo[]; slots: PlanSlotInfo[]; overlaps: Overlap[]; exams: ExamBatchInfo[] }

export const PLAN_KEY = '/api/admin/timetable/plan';
export const usePlanData = () => useSWR<PlanData>(PLAN_KEY, authedJson);

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The slots as the solver's spans (minutes). */
export const asSpans = (slots: PlanSlotInfo[]) => slots.map((s) => ({ courseId: s.courseId, day: s.dayOfWeek, start: toMinutes(s.startTime), end: toMinutes(s.endTime), roomId: s.roomId }));
