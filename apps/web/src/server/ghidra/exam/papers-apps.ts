import { AGENTS } from '../../agents/playbooks';
import { SYSTEM as BOOKING_SYSTEM, SCHEMA as BOOKING_SCHEMA } from '../../travel-booking';
import { BILL_SCHEMA, BILL_SYSTEM } from '../../green-business';
import { SYSTEM as HOME_SYSTEM, SCHEMA as HOME_SCHEMA } from '../../green-home';
import { NARRATIVE_SCHEMA, NARRATIVE_SYSTEM } from '../../impact-rooms';
import { hyperionRich } from '../own-model';
import { cites, has, markdown, newNumbers, wordCount, type Ask, type CodeRun, type Paper, type Rand, type Rule } from './kit';
import { BUYER_ASKS, CITIES, FIRST, PASSAGES, PRODUCTS, factsOf } from './material';

// The app agents (their rules are the training kit's, scripts/ai/agents-ai.py, with support's numbers loosened for
// numbered steps), booking, Hyperion and the bill readers.

type O = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const agent = (kind: keyof typeof AGENTS, prompt: string, rules: Rule[], maxTokens = 1200): Ask =>
  ({ mode: 'json', system: AGENTS[kind].system, schema: AGENTS[kind].schema, prompt, maxTokens, lite: true, rules });

const PROMISE = /\b(we|i)(['’]ll| will| can)\s+(refund|replace|repair|send you|give you a (refund|replacement))|\bguarantee/i;
const ASK_SECRET = /\b(send|share|give|provide|enter|tell|confirm)\b[^.?!]{0,40}\b(password|card number|card details|cvv|pin)\b/i;
const PRICE = /[$€£₹¥]\s?\d|\d\s?(usd|eur|inr|gbp|rupees?|dollars?|euros?|pounds)\b/i;
const CLOCK = /\b\d{1,2}[:.]\d{2}\s?(am|pm)?\b|\b\d{1,2}\s?(am|pm)\b/i;
const GREEN = /carbon[- ]neutral|eco[- ]friendly|\bcures?\b|guaranteed|100 ?% (natural|green|safe)/i;

const support: Paper = {
  n: 72,
  ask(r, i) {
    const p = PRODUCTS[i % PRODUCTS.length], q = BUYER_ASKS[Math.floor(i / PRODUCTS.length) % BUYER_ASKS.length];
    const facts = factsOf(p), prompt = `Product facts:\n${facts}\n\nThe buyer asks: ${q}`;
    const secret = /\b(4111[\d ]+|sunflower22)\b/.exec(q)?.[0];
    return agent('support', prompt, [
      ['under 130 words', (a: O) => wordCount(str(a.answer)) <= 130],
      ['recall not first', (a: O) => !p.recall || has(str(a.answer).slice(0, 300), 'recall')],
      ['a promise', (a: O) => !PROMISE.test(str(a.answer))],
      ['asks for a secret', (a: O) => !ASK_SECRET.test(str(a.answer)) || /\b(never|don[’']t|do not|no need)\b/i.test(str(a.answer))],
      ['repeats a secret', (a: O) => !secret || !str(a.answer).includes(secret.trim())],
      ['a number not in the facts', (a: O) => !newNumbers(str(a.answer), prompt).length],
    ]);
  },
};

const travel: Paper = {
  n: 60,
  ask(r) {
    const days = r.pick([1, 2, 3, 3, 4, 5, 7, 10]), people = r.pick([1, 2, 2, 3, 4, 6]);
    const date = r.chance(0.4) ? ` from 2027-${String(r.int(1, 12)).padStart(2, '0')}-${String(r.int(1, 28)).padStart(2, '0')}` : '';
    return agent('travel', `Tips for ${days} days in ${r.pick(CITIES)} for ${people} ${people === 1 ? 'person' : 'people'}${date}.`, [
      ['3 to 5 tips', (a: O) => list(a.tips).length >= 3 && list(a.tips).length <= 5],
      ['a tip too short or long', (a: O) => list(a.tips).every((t) => typeof t === 'string' && t.length >= 10 && t.length <= 240)],
      ['a price', (a: O) => !list(a.tips).some((t) => PRICE.test(String(t)))],
      ['a clock time', (a: O) => !list(a.tips).some((t) => CLOCK.test(String(t)))],
    ]);
  },
};

const research: Paper = {
  n: 60,
  ask(r) {
    const ps = r.some(PASSAGES, r.int(2, 4));
    const sources = ps.map((p, k) => `[${k + 1}] ${p.title}: ${p.text}`).join('\n\n');
    return agent('research', `Topic: ${ps[0].title.toLowerCase()}\n\nSources:\n${sources}`, [
      ['summary length', (a: O) => str(a.summary).length >= 80 && str(a.summary).length <= 1400],
      ['too few citations', (a: O) => cites(str(a.summary)).length >= 2],
      ['cites a source that isn’t there', (a: O) => [...cites(str(a.summary)), ...list(a.points).flatMap((x) => cites(String(x)))].every((c) => c >= 1 && c <= ps.length)],
      ['markdown', (a: O) => !markdown(str(a.summary))],
      ['over 5 points', (a: O) => list(a.points).length <= 5],
      ['a point without a source', (a: O) => list(a.points).every((x) => cites(String(x)).length > 0)],
    ]);
  },
};

const TOPICS = ['our beach clean-up this Saturday', 'a new recycled-cotton T-shirt line', 'the school science fair', 'volunteers needed for the food bank',
  'open day for new students', 'our winter coat drive', 'a repair café for broken electronics', 'the debate team reaching the final', 'a tree-planting morning', 'our new library hours'];
const WHO = ['the brand Northfield', 'the organisation Harbour Aid', 'the school Riverside Academy', null];
const PLATFORMS = ['Instagram', 'LinkedIn', 'X', 'Facebook', 'WhatsApp'];
const social: Paper = {
  n: 60,
  ask(r) {
    const want = r.some(PLATFORMS, r.int(1, 3)), count = Math.max(want.length, r.int(1, 3)), who = r.pick(WHO), topic = r.pick(TOPICS);
    const prompt = `Topic: ${topic}\nPlatforms: ${want.join(', ')}\nHow many posts in all: ${count}\n${who ? `They post for: ${who}.` : 'They post for themselves.'}`;
    const posts = (a: O) => list(a.posts) as O[];
    const lower = new Set(want.map((w) => w.toLowerCase()));
    return agent('social', prompt, [
      ['number of posts', (a: O) => posts(a).length >= want.length && posts(a).length <= 6],
      ['a platform not asked', (a: O) => posts(a).every((p) => lower.has(str(p.platform).toLowerCase().replace('twitter', 'x')))],
      ['X over 280', (a: O) => posts(a).every((p) => str(p.platform).toLowerCase() !== 'x' || str(p.text).length <= 280)],
      ['a green or health claim', (a: O) => posts(a).every((p) => !GREEN.test(str(p.text)))],
      ['an invented number', (a: O) => posts(a).every((p) => !newNumbers(str(p.text), prompt).length)],
    ]);
  },
};

// ——— Booking ———

const HOTELS = ['Casa do Rio', 'Hotel Kanade', 'The Pink Haveli', 'Hostal Luna', 'Harbour View Inn', 'Pera Garden Suites', 'Lotus Old Quarter Hotel', 'The Grassmarket Rooms'];
const booking: Paper = {
  n: 50,
  ask(r) {
    const hotel = r.pick(HOTELS), city = r.pick(CITIES), m = r.int(1, 12), d = r.int(1, 20), nights = r.int(1, 6), guests = r.int(1, 5);
    const iso = (day: number) => `2027-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const inD = iso(d), outD = iso(d + nights);
    const long = new Date(`${inD}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    const longOut = new Date(`${outD}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    const street = `${r.int(2, 180)} ${r.pick(['Rua das Flores', 'Station Road', 'Calle Mayor', 'Main Street', 'Old Town Lane'])}`;
    const email = r.chance(0.5)
      ? `Your booking is confirmed!\nBooking number ${r.int(100000, 999999)}\n${hotel}\n${street}, ${city}\nCheck-in: ${long} (from 15:00)\nCheck-out: ${longOut} (until 11:00)\n${guests} ${guests === 1 ? 'adult' : 'adults'}, ${nights} ${nights === 1 ? 'night' : 'nights'}\nTotal price: €${r.int(90, 900)}.00, paid with card ending ${r.int(1000, 9999)}\nGuest name: ${r.pick(FIRST)} Silva`
      : `Hi ${r.pick(FIRST)}, thanks for booking with us. Reservation for ${guests} guest${guests > 1 ? 's' : ''} at ${hotel} (${street}, ${city}). Arrival ${inD}, departure ${outD}. Amount charged: USD ${r.int(80, 700)}. Card **** ${r.int(1000, 9999)}.`;
    return {
      mode: 'json', system: BOOKING_SYSTEM, schema: BOOKING_SCHEMA, prompt: email, maxTokens: 300, lite: true, rules: [
        ['wrong hotel', (a: O) => has(str(a.hotel), hotel)],
        ['wrong city', (a: O) => has(str(a.city), city)],
        ['wrong check-in', (a: O) => a.checkIn === inD],
        ['wrong check-out', (a: O) => a.checkOut === outD],
        ['wrong guests', (a: O) => a.guests === guests],
        ['kept a price or card', (a: O) => !/[€$]|usd|card|\*\*\*\*/i.test(Object.values(a).join(' '))],
      ],
    };
  },
};

// ——— Hyperion ———

const fmt = (v: number) => String(Math.round(v * 1e4) / 1e4);
/** The numbers a run printed, so "ans = 15" and "15.0000" both count. */
const printed = (out: string) => (out.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? []).map(Number);
const shows = (want: number[]) => (c: CodeRun) => want.every((w) => printed(c.out).some((x) => Math.abs(x - w) <= 1e-3 * Math.max(1, Math.abs(w))));
const runs: Rule = ['the code doesn’t run in Hyperion', (c: CodeRun) => !!c.code && c.ok];
function hyperionTask(r: Rand, i: number): [string, Rule[]] {
  const v = Array.from({ length: r.int(4, 7) }, () => r.int(1, 40));
  const sum = v.reduce((s, x) => s + x, 0), sorted = [...v].sort((a, b) => a - b);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const n = r.int(5, 12), a = r.int(1, 6), b = r.int(1, 6), c1 = r.int(2, 9), c2 = r.int(2, 9);
  const vec = `[${v.join(' ')}]`;
  switch (i % 10) {
    case 0: return [`Compute and print the mean of ${vec}.`, [runs, ['prints the wrong mean', shows([sum / v.length])]]];
    case 1: return [`Print the median of the numbers ${v.join(', ')}.`, [runs, ['prints the wrong median', shows([median])]]];
    case 2: return [`Write a script that prints the factorial of ${n}.`, [runs, ['prints the wrong factorial', shows([[...Array(n).keys()].reduce((s, k) => s * (k + 1), 1)])]]];
    case 3: return [`Solve the linear system x + y = ${a + b}, x - y = ${a - b} and print x and y.`, [runs, ['wrong solution', shows([a, b])]]];
    case 4: return [`Plot sin(x) for x from 0 to 2*pi with a title and axis labels.`, [runs, ['no figure', (c: CodeRun) => c.figures > 0]]];
    case 5: return [`Find the roots of x^2 - ${c1 + c2}x + ${c1 * c2} = 0 and print them.`, [runs, ['wrong roots', shows([c1, c2])]]];
    case 6: return [`Print the sum of the integers from 1 to ${n * 10} using a loop.`, [runs, ['wrong sum', shows([(n * 10 * (n * 10 + 1)) / 2])]]];
    case 7: return [`Make a ${a + 1}x${a + 1} matrix of ones times ${b}, then print the sum of all its elements.`, [runs, ['wrong sum', shows([(a + 1) * (a + 1) * b])]]];
    case 8: return [`Plot the bar chart of ${vec} and print its largest value.`, [runs, ['no figure', (c: CodeRun) => c.figures > 0], ['wrong maximum', shows([Math.max(...v)])]]];
    default: return [`Print the standard deviation (sample, like std) of ${vec}, rounded to 4 decimals.`, [runs, ['wrong standard deviation', shows([Number(fmt(Math.sqrt(v.reduce((s, x) => s + (x - sum / v.length) ** 2, 0) / (v.length - 1))))])]]];
  }
}
/** Hyperion's paper. The system text needs the function list, which is read once (hyperionRich is async). */
export async function hyperionPaper(): Promise<Paper> {
  const system = await hyperionRich();
  return { n: 60, ask: (r, i) => { const [prompt, rules] = hyperionTask(r, i); return { mode: 'code', system, prompt, maxTokens: 1400, rules }; } };
}

// ——— Bills ———

const SUPPLIERS = ['Volta Energy', 'CityGas', 'Northern Power', 'Brightline Utilities'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const homeEnergy: Paper = {
  n: 50,
  ask(r) {
    const kind = r.pick(['ELECTRICITY', 'ELECTRICITY', 'GAS', 'OIL'] as const), m = r.int(1, 12), y = 2026, used = r.int(80, 900);
    const unit = kind === 'ELECTRICITY' ? 'kWh' : kind === 'GAS' ? 'm3' : 'L';
    const html = `<div style="font:15px Arial;width:520px;padding:24px;border:1px solid #999"><h2>${r.pick(SUPPLIERS)}</h2><p>${kind === 'ELECTRICITY' ? 'Electricity' : kind === 'GAS' ? 'Natural gas' : 'Heating oil'} bill · Account ${r.int(10000, 99999)}</p>
<p>Billing period: 1 ${MONTHS[m - 1]} ${y} – ${m === 2 ? 28 : 30} ${MONTHS[m - 1]} ${y}</p><table border="1" cellpadding="6"><tr><td>Used this period</td><td><b>${used} ${unit}</b></td></tr>
<tr><td>Price per ${unit}</td><td>€0.${r.int(10, 99)}</td></tr><tr><td>Total to pay</td><td>€${r.int(30, 400)}.${r.int(10, 99)}</td></tr></table></div>`;
    return {
      mode: 'image', system: HOME_SYSTEM, schema: HOME_SCHEMA, prompt: 'Read this bill.', html, maxTokens: 300, rules: [
        ['wrong kind', (a: O) => a.kind === kind],
        ['wrong month', (a: O) => a.month === `${y}-${String(m).padStart(2, '0')}`],
        ['took the price, not the amount used', (a: O) => a.amount === used],
        ['wrong unit', (a: O) => str(a.unit).toLowerCase().replace('³', '3') === unit.toLowerCase()],
      ],
    };
  },
};

const carbon: Paper = {
  n: 60,
  ask(r) {
    const m = r.int(1, 12), period = `2026-${String(m).padStart(2, '0')}`, month = `${MONTHS[m - 1]} 2026`;
    const kinds = [
      () => { const kwh = r.int(1200, 40000); return { text: `${r.pick(SUPPLIERS)} – business electricity\nPeriod ending 30 ${month}\nConsumption: ${kwh.toLocaleString('en-GB')} kWh\nStandard tariff (grid)\nAmount due: £${r.int(300, 9000)}`, cat: 'electricity', qty: kwh }; },
      () => { const mwh = r.int(2, 60); return { text: `Electricity statement, ${month}\nUsage: ${mwh} MWh\nTariff: standard\nTotal: €${r.int(500, 9000)}`, cat: 'electricity', qty: mwh * 1000 }; },
      () => { const l = r.int(40, 900); return { text: `Fuel receipt – ${r.pick(['Shell', 'BP', 'Indian Oil'])}\nDate: 12 ${month}\nDiesel ${l} L\nTotal ₹${r.int(4000, 90000)}`, cat: 'diesel', qty: l }; },
      () => { const g = r.int(10, 200); return { text: `Fleet fuel card summary, ${month}\nPetrol: ${g} gallons (US)\nCost: $${r.int(50, 900)}`, cat: 'petrol', qty: Math.round(g * 3.785) }; },
      () => { const kwh = r.int(2000, 30000); return { text: `CityGas business account\nBilling period to 31 ${month}\nGas used: ${kwh} kWh\nCharges: €${r.int(200, 4000)}`, cat: 'gas', qty: kwh }; },
    ];
    const k = r.pick(kinds)();
    const prompt = `This year is 2026. List the activity lines.\n\n${k.text}`;
    const line = (a: O) => (list(a.lines) as O[]).find((l) => l.category === k.cat);
    return {
      mode: 'json', system: BILL_SYSTEM, schema: BILL_SCHEMA, prompt, maxTokens: 1500, rules: [
        ['missed the line', (a: O) => !!line(a)],
        ['wrong quantity', (a: O) => Math.abs(Number(line(a)?.quantity) - k.qty) <= Math.max(1, k.qty * 0.01)],
        ['wrong month', (a: O) => line(a)?.period === period],
        ['a line not on the bill', (a: O) => list(a.lines).length <= 2],
      ],
    };
  },
};

// ——— Relief: an NGO project's report ———

const impact: Paper = {
  n: 50,
  ask(r) {
    const hours = r.int(20, 400), people = r.int(5, 120), kg = r.int(50, 2000), student = `${r.pick(FIRST)} ${r.pick(['Okafor', 'Silva', 'Nair'])}`;
    const facts = JSON.stringify({
      project: r.pick(['River Clean-up', 'Food Bank Fridays', 'Reading Buddies', 'Community Garden']), ngo: r.pick(['Harbour Aid', 'GreenRoots', 'Open Shelf']),
      description: 'Students from the school volunteer each week with the NGO.', period: { from: '2026-10-01', to: '2026-10-31' },
      figures: [{ label: 'Volunteer hours', value: hours }, { label: 'People helped', value: people }, { label: 'Kilograms collected', value: kg }],
      call: { title: 'Monthly check-in', summary: 'The team planned next month’s sessions.' },
      highlights: [`${student} led the Saturday session`, 'A new partner school joined'],
    });
    return {
      mode: 'json', system: NARRATIVE_SYSTEM, schema: NARRATIVE_SCHEMA, prompt: facts, maxTokens: 600, lite: true, rules: [
        ['headline over 14 words', (a: O) => wordCount(str(a.headline)) <= 14],
        ['narrative over 110 words', (a: O) => wordCount(str(a.narrative)) <= 121],
        ['an invented number', (a: O) => !newNumbers(`${str(a.headline)} ${str(a.narrative)}`, facts, 2).length],
        ['names a student', (a: O) => !has(`${str(a.headline)} ${str(a.narrative)}`, student.split(' ')[0])],
      ],
    };
  },
};

export const APP_PAPERS = { support, travel, research, social, booking, 'home-energy': homeEnergy, carbon, 'impact-rooms': impact };
