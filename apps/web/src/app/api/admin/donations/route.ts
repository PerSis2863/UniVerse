import { route } from '@/server/assignments';
import { adminDonations, saveNgoDonationSettings } from '@/server/donations';

// Stage 5 · Q16: admins: NGOs' donation settings (on/off, 80G number, PAN), totals and donations.
export const GET = (req: Request) => route(req, (user) => adminDonations(user));
export const PATCH = (req: Request) => route(req, async (user) => saveNgoDonationSettings(user, await req.json().catch(() => ({}))));
