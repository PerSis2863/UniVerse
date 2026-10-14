import { route } from '@/server/assignments';
import { skillsMatch } from '@/server/skills-bridge';

// Stage 5 · D18: open internships and NGO projects ranked by my verified skills, with where to learn the rest.
export const GET = (req: Request) => route(req, (user) => skillsMatch(user));
