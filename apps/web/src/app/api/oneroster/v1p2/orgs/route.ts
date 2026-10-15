import { getOneRosterOrgs, oneRosterGet } from '@/server/oneroster';

// OneRoster 1.2 orgs: needs the school's API key with "courses.read" (src/server/oneroster.ts oneRosterGet).
export const GET = (req: Request) => oneRosterGet(req, 'courses.read', (org) => getOneRosterOrgs(org));
