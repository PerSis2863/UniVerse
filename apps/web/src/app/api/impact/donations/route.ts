import { route } from '@/server/assignments';
import { startDonation } from '@/server/donate';
import { myDonations, projectSupport } from '@/server/donations';

// Stage 5 · Q16: donations to NGO projects.
// GET: my donations · GET ?projectId=: what a project has been given · POST: start one (returns Stripe's page)
export const GET = (req: Request) => route(req, (user) => {
  const projectId = new URL(req.url).searchParams.get('projectId');
  return projectId ? projectSupport(projectId) : myDonations(user);
});
export const POST = (req: Request) => route(req, async (user) => startDonation(user, await req.json().catch(() => ({})), new URL(req.url).origin));
