import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// M114 (the council: "546 server addresses that each must check who is asking"): every API route
// either signs the person in through one of the shared gates, or is on OPEN below with the reason it
// may answer without a sign-in (and, where it guards itself another way, the check its file must
// contain). A new route with neither fails here, so leaving a route open is always written down.

const API = fileURLToPath(new URL('../app/api', import.meta.url));
const MODULES = fileURLToPath(new URL('../server/modules', import.meta.url));

/** Signs the person in, or (publicRoute) says in its own name that the route is public. */
const GATE = /\b(getSessionUser|requireAdmin|requireFeature|authorize|publicRoute)\s*\(|\broute\(req\b/;

const TOKEN = /\btoken\b/;
const CRON = /x-cron/;
const SCHOOL_KEY = /\boneRosterGet\(/;
const API_KEY = /\bverifyApiKey\(/;

/** Route → [why it answers without a sign-in, the check its file must contain]. */
const OPEN: Record<string, [string, RegExp?]> = {
  'auth/sso/lookup': ['which sign-in a school uses, found by its address or email domain (no people)'],
  'calendar/[token]': ['a calendar app’s subscription: the private token in the link is the key', TOKEN],
  'collab/shared/[token]': ['a view link to shared work: the token is the key', TOKEN],
  'core/[...path]': ['the platform API: each of its routes signs the person in itself (src/server/router.ts)', /\bhandle\b/],
  'cron/daily': ['a scheduled job: only the Worker’s own timer, with its secret header', CRON],
  'cron/daily-more': ['a scheduled job: only the Worker’s own timer, with its secret header', CRON],
  'cron/digest': ['a scheduled job: only the Worker’s own timer, with its secret header', CRON],
  'cron/reminders': ['a scheduled job: only the Worker’s own timer, with its secret header', CRON],
  'cron/usage-alert': ['a scheduled job: only the Worker’s own timer, with its secret header', CRON],
  'csp-report': ['browsers report what the security policy blocked'],
  'errors': ['browsers report the errors they caught, signed in or not'],
  'files/[key]': ['a stored file: its random key is the private link'],
  'files/[key]/[name]': ['a stored file: its random key is the private link'],
  'geo': ['the visitor’s own country, as Cloudflare sees it'],
  'guardian-contact/[token]': ['the settings link in a guardian’s emails: the token is the key', TOKEN],
  'guardian/[token]': ['a student’s shared parent view, read-only: the token is the key', TOKEN],
  'guest/link': ['whether a call’s guest link still works (no details)'],
  'guest/ticket': ['a guest’s ticket for a call: the link’s token is the key', TOKEN],
  'i18n/[lang]': ['the screens’ words in one language'],
  'impact-reports/public/[slug]': ['an impact report its school published'],
  'impact-rooms/[id]/public': ['an impact room’s public page: figures and staff posts, never students'],
  'impact/totals': ['the landing’s rounded site totals, nothing about anyone'],
  'invite': ['a school invitation code → its role, for the join page'],
  'league/[slug]': ['an Impact League challenge’s public showcase'],
  'lti/jwks': ['the LTI tool’s public keys, for an LMS’s registration form'],
  'lti/launch': ['LTI 1.3 launch: the LMS’s signed token is checked', TOKEN],
  'lti/login': ['LTI 1.3 login start from the LMS (carries no data)'],
  'marketplace/packs/[id]': ['a content pack’s public catalogue page'],
  'oneroster/v1p2/classes': ['OneRoster for a school’s own systems: its API key, with the scope', SCHOOL_KEY],
  'oneroster/v1p2/courses': ['OneRoster for a school’s own systems: its API key, with the scope', SCHOOL_KEY],
  'oneroster/v1p2/enrollments': ['OneRoster for a school’s own systems: its API key, with the scope', SCHOOL_KEY],
  'oneroster/v1p2/orgs': ['OneRoster for a school’s own systems: its API key, with the scope', SCHOOL_KEY],
  'oneroster/v1p2/users': ['OneRoster for a school’s own systems: its API key, with the scope', SCHOOL_KEY],
  'org/branding': ['a school’s public look (name, colours)'],
  'org/manifest': ['a school’s app manifest (name, colours, icons)'],
  'p/[handle]': ['a portfolio its owner made public'],
  'passport/did': ['the key credentials are signed with, for anyone verifying one'],
  'passport/issuer': ['the Open Badges issuer profile'],
  'passport/jwks': ['the key badges are signed with, for anyone verifying one'],
  'passport/public/[slug]': ['a skills passport its student published'],
  'passport/public/[slug]/badge': ['the signed badge of a published passport'],
  'passport/verify': ['checks a credential someone holds (nothing kept)'],
  'receipts/[id]': ['a completed payment’s receipt, by its id (as the receipt page always was)'],
  'scholarships/verify/[token]': ['checks a scholarship’s QR code: the token is the key', TOKEN],
  'share-in': ['the phone’s “share to UniVerse”: only passes the text into the app'],
  'share/[token]': ['a files-hub share link: the token is the key', TOKEN],
  'trust/status': ['the Trust Center’s public status'],
  'v1/attendance': ['the institutional REST API: the school’s API key', API_KEY],
  'v1/courses': ['the institutional REST API: the school’s API key', API_KEY],
  'v1/grades': ['the institutional REST API: the school’s API key', API_KEY],
  'v1/openapi': ['the REST API’s public description'],
  'v1/students': ['the institutional REST API: the school’s API key', API_KEY],
  'vitals': ['browsers’ page-speed measures (no people)'],
  'webhooks/razorpay': ['Razorpay’s payment events: their signature is checked', /\bverifyRazorpayWebhookSignature\(/],
  'webhooks/stripe': ['Stripe’s payment events: their signature is checked', /\bconstructEvent/],
};

function routes(dir = API): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return routes(path);
    return e.name === 'route.ts' ? [relative(API, dir).split(sep).join('/')] : [];
  });
}
const code = (route: string) => readFileSync(join(API, route, 'route.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

describe('who may call each API route', () => {
  const all = routes();

  it('finds the routes', () => expect(all.length).toBeGreaterThan(500));

  it('every route signs the person in, or is listed as open on purpose', () => {
    expect(all.filter((r) => !GATE.test(code(r)) && !(r in OPEN))).toEqual([]);
  });

  it('an open route guards itself the way its entry says', () => {
    expect(Object.entries(OPEN).filter(([r, [, guard]]) => guard && all.includes(r) && !guard.test(code(r))).map(([r]) => r)).toEqual([]);
  });

  it('the open list has no stale entries (removed, or signing people in now)', () => {
    expect(Object.keys(OPEN).filter((r) => !all.includes(r) || GATE.test(code(r)))).toEqual([]);
  });

  it('an open route never asks for email addresses or phone numbers itself (the API-key ones are the school’s own)', () => {
    const keyed = (r: string) => OPEN[r]?.[1] === API_KEY || OPEN[r]?.[1] === SCHOOL_KEY;
    expect(Object.keys(OPEN).filter((r) => !keyed(r) && all.includes(r) && /\b(email|phone)\s*:\s*true/.test(code(r)))).toEqual([]);
  });
});

// The platform API's own routes (src/server/modules, served by api/core) sign people in unless declared
// `public: true`. Each of those is listed here with why: "file METHOD path", or "file controller name"
// for a whole controller. Keep each declaration on one line, so this can read it.
const PUBLIC_MODULE: Record<string, string> = {
  'auth GET passkeys/available': 'whether passkey sign-in is on',
  'auth POST passkeys/sign-in/options': 'passkey sign-in, step 1',
  'auth POST passkeys/sign-in': 'passkey sign-in, step 2: the passkey is the proof',
  'auth POST login': 'signing in',
  'blog controller blog': 'the public blog',
  'health controller health': 'the health check',
  'impact-apps POST texts/inbound': 'Twilio’s texts: their signature is checked (M107)',
  'impact GET certificates/:id/pdf': 'a certificate’s PDF by its id, for verifying it',
  'impact controller verify': 'checking a certificate is real',
  'notifications GET vapid-public-key': 'the public key push messages need',
  'trace POST scan/:code': 'anyone scans a product’s signed code',
  'trace POST scan/:code/warranty': 'from a scanned product’s page: one per unit, refused on a likely copy',
  'trace POST scan/:code/review': 'from a scanned product’s page: one per unit, refused on a likely copy',
  'trace GET carry/:key': 'a shipment’s carrier page: the carrier key is the password',
  'trace POST carry/:key/ping': 'a shipment’s carrier page: the carrier key is the password',
  'trace POST carry/:key/arrive': 'a shipment’s carrier page: the carrier key is the password',
  'trace POST carry/:key/reading': 'a sensor’s reading: the carrier key is the password',
  'trace GET public/:slug': 'a brand’s public page',
  'trace GET dpp/:gtin': 'a product’s EU Digital Product Passport (public by design)',
  'impact-apps GET aid/:code': 'an aid box’s trip for donors (M151): the unguessable code in its link or QR code; towns and times, never people',
  'trace GET supplier': 'the supplier portal: the key in its link',
  'trace POST supplier': 'the supplier portal: the key in its link',
};

describe('the platform API’s public routes', () => {
  const declared = readdirSync(MODULES).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).flatMap((file) => {
    const name = file.replace(/\.ts$/, '');
    return readFileSync(join(MODULES, file), 'utf8').split('\n').filter((line) => /\bpublic:\s*true/.test(line)).map((line) => {
      const route = line.match(/\.(get|post|put|patch|delete)(?:<[^>]*>)?\(\s*'([^']*)',\s*\{[^}]*\bpublic:\s*true/);
      if (route) return `${name} ${route[1].toUpperCase()} ${route[2]}`;
      const controller = line.match(/controller\(\s*'([^']*)',\s*\{[^}]*\bpublic:\s*true/);
      return controller ? `${name} controller ${controller[1]}` : `${name}: can’t tell which route (keep it on one line) → ${line.trim()}`;
    });
  });

  it('finds them', () => expect(declared.length).toBeGreaterThan(10));
  it('each one is listed, with why', () => expect(declared.filter((k) => !(k in PUBLIC_MODULE))).toEqual([]));
  it('the list has no stale entries', () => expect(Object.keys(PUBLIC_MODULE).filter((k) => !declared.includes(k))).toEqual([]));
});
