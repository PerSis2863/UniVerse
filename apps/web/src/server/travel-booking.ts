import type { SessionUser } from '@/lib/server-auth';
import { isDay } from '@/lib/travel-plan';
import { BadRequestException, HttpException } from './http';
import { text, type Body } from './body';
import { featureOff } from './moderation';
import { spendAi } from './ai-budget';
import { logAiUse } from './ai-receipts';
import { ghidraJson } from './ghidra/brain';

// M329: "if user had already booked the hotel somewhere then they can come in our website": a pasted booking
// confirmation (the email's text) read into the hotel's name, address, town and dates, to fill the form that plans
// the stay's days. Not saved; the person checks it before anything is made. One AI request, within the day's
// allowance and the owner's AI switch.

export const SYSTEM = 'You read a hotel or holiday-rental booking confirmation. Give the place to stay\'s name, its street address, the town or city it is in (as a travel guide would name it, in English), the check-in and check-out dates (YYYY-MM-DD) and the number of guests. Leave out anything the text does not say. Ignore prices, card numbers and names of people.';
export const SCHEMA = { type: 'OBJECT', properties: { hotel: { type: 'STRING' }, address: { type: 'STRING' }, city: { type: 'STRING' }, checkIn: { type: 'STRING' }, checkOut: { type: 'STRING' }, guests: { type: 'NUMBER' } } };
const line = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, n) : null);

/** POST /travel/booking/read { text }: what a booking confirmation says. */
export async function readBooking(u: SessionUser, b: Body) {
  const said = text(b.text).trim().slice(0, 8000);
  if (said.length < 30) throw new BadRequestException('Paste the booking confirmation’s text (the email or the page).');
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) throw new HttpException('Reading bookings is off right now: type the hotel in instead.', 503);
  const spend = await spendAi(u);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  await logAiUse(u.id, { kind: 'booking', detail: 'Read a hotel booking for a trip plan' });
  const out = await ghidraJson<Body>('booking', SYSTEM, said, SCHEMA, 300, true).catch(() => null);
  if (!out) throw new HttpException('That couldn’t be read just now: type the hotel in instead.', 502);
  const checkIn = isDay(out.checkIn) ? out.checkIn : null, checkOut = isDay(out.checkOut) && (!checkIn || out.checkOut > checkIn) ? out.checkOut : null;
  const guests = Number(out.guests);
  return {
    hotel: line(out.hotel, 120), address: line(out.address, 200), city: line(out.city, 80), checkIn, checkOut,
    guests: Number.isInteger(guests) && guests >= 1 && guests <= 20 ? guests : null, left: spend.left,
  };
}
