'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { authedJson } from '@/lib/authed-fetch';

// The person's courses for Learning DNA pages (Stage 5 · D1): the course tutor's list (enrolled for
// students, taught for teachers). Remembers the choice in the address (?course=).

interface Courses { courses: { id: string; code: string; name: string }[] }

export function useCourseChoice() {
  const { data } = useSWR<Courses>('/api/tutor/courses', authedJson);
  const [courseId, setCourseId] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setCourseId(new URLSearchParams(window.location.search).get('course')), 0);
    return () => clearTimeout(t);
  }, []);
  const courses = data?.courses ?? null;
  const chosen = courses?.find((c) => c.id === courseId) ?? courses?.[0] ?? null;
  const choose = (id: string) => {
    setCourseId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('course', id);
    window.history.replaceState(window.history.state, '', url);
  };
  return { courses, chosen, choose };
}

export function CoursePicker({ courses, value, onChange }: { courses: { id: string; code: string; name: string }[]; value: string; onChange: (id: string) => void }) {
  if (courses.length < 2) return null;
  return (
    <select aria-label="Course" value={value} onChange={(e) => onChange(e.target.value)} className="input sm:w-80">
      {courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
    </select>
  );
}
