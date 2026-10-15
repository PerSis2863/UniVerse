import { getOneRosterUsers, oneRosterGet } from '@/server/oneroster';

// OneRoster 1.2 users: needs the school's API key with "students.read" (src/server/oneroster.ts oneRosterGet).
export const GET = (req: Request) => oneRosterGet(req, 'students.read', (org, p, url) => getOneRosterUsers(org, url.searchParams.get('role') || undefined, p.limit, p.offset));
