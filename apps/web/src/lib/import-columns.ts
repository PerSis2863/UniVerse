import type { CsvColumn } from './csv';

// What each bulk import reads (Stage 5 · B15.7; src/server/bulk-import.ts): the columns, the names
// a spreadsheet might use for them, and a hint shown on the import screen. Exports use the same
// headers, so a file can be exported, edited and imported back.

export const IMPORT_KINDS = ['people', 'enrolments', 'courses', 'timetable'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];
export const MAX_IMPORT_ROWS = 1000;

export const IMPORT_COLUMNS: Record<ImportKind, CsvColumn[]> = {
  people: [
    { key: 'email', label: 'Email', required: true, aliases: ['e mail', 'email address', 'mail', 'student email'] },
    { key: 'role', label: 'Role', aliases: ['type', 'account type'], hint: 'student or teacher (student if blank)' },
    { key: 'name', label: 'Name', aliases: ['full name', 'student name'], hint: 'shown in the preview only: people type their own name when they join' },
    { key: 'courses', label: 'Courses', aliases: ['course codes', 'classes', 'course'], hint: 'course codes separated by ; (students only)' },
  ],
  enrolments: [
    { key: 'email', label: 'Email', required: true, aliases: ['e mail', 'student email', 'email address'] },
    { key: 'course', label: 'Course', required: true, aliases: ['course code', 'code', 'class'] },
  ],
  courses: [
    { key: 'code', label: 'Code', required: true, aliases: ['course code'] },
    { key: 'name', label: 'Name', aliases: ['course name', 'title'], hint: 'needed for new courses' },
    { key: 'teacher', label: 'Teacher', aliases: ['teacher email', 'instructor', 'instructor email'], hint: 'their email; needed for new courses' },
    { key: 'credits', label: 'Credits', aliases: ['credit', 'units'], hint: '0–30 (3 if blank)' },
    { key: 'department', label: 'Department', aliases: ['dept', 'subject'] },
    { key: 'status', label: 'Status', hint: 'published or draft (published if blank)' },
    { key: 'description', label: 'Description', aliases: ['about', 'summary'] },
  ],
  timetable: [
    { key: 'course', label: 'Course', required: true, aliases: ['course code', 'code', 'class'] },
    { key: 'day', label: 'Day', required: true, aliases: ['weekday', 'day of week'], hint: 'Mon–Sun' },
    { key: 'start', label: 'Start', required: true, aliases: ['from', 'start time', 'begins'], hint: '09:00' },
    { key: 'end', label: 'End', required: true, aliases: ['to', 'end time', 'ends'], hint: '10:30' },
    { key: 'room', label: 'Room', aliases: ['location', 'room name'], hint: 'a room from Rooms, or blank' },
    { key: 'type', label: 'Type', aliases: ['kind', 'session type'], hint: 'lecture, lab or tutorial (lecture if blank)' },
  ],
};

export const IMPORT_TITLES: Record<ImportKind, { title: string; about: string }> = {
  people: { title: 'People', about: 'Invite students and teachers by email. They’re approved as soon as they sign up with that email, and put in the classes you list.' },
  enrolments: { title: 'Enrolments', about: 'Put students in classes. People invited but not joined yet are added when they join.' },
  courses: { title: 'Courses', about: 'Add courses, or change existing ones (matched by code).' },
  timetable: { title: 'Timetable', about: 'Add weekly class times, with rooms. Clashes with a room’s other classes are refused.' },
};
