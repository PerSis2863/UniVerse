import { route } from '@/server/assignments';
import { createCampus } from '@/server/campus-network';

// POST { name, country, city, emailDomains, lat, lng, logoUrl } (admins): add a campus. People
// whose email matches its domains join it straight away.
export const POST = (req: Request) => route(req, async (user) => createCampus(user, await req.json().catch(() => ({}))));
