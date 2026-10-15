import { getOneRosterEnrollments, oneRosterGet } from '@/server/oneroster';

// OneRoster 1.2 enrollments: needs the school's API key with "students.read" (src/server/oneroster.ts oneRosterGet).
export const GET = (req: Request) => oneRosterGet(req, 'students.read', (org, p) => getOneRosterEnrollments(org, p.limit, p.offset));
