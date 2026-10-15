import { getOneRosterClasses, oneRosterGet } from '@/server/oneroster';

// OneRoster 1.2 classes: needs the school's API key with "courses.read" (src/server/oneroster.ts oneRosterGet).
export const GET = (req: Request) => oneRosterGet(req, 'courses.read', (org, p) => getOneRosterClasses(org, p.limit, p.offset));
