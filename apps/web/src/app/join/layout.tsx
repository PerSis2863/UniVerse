import { shareMeta } from '@/lib/share-meta';

// School invite links (/join, /join/<code>): the title, and the picture a shared link shows (src/lib/share-meta.ts).
export const metadata = shareMeta('campus', 'Courses, grades, timetable, messages and an AI tutor for students, teachers, parents and schools.');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
