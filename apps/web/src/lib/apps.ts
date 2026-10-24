// UniVerse Impact is a home for several apps, each making a difference somewhere (the owner, 24 Oct
// 2026: "there are a lot of different mini software or website in the main website like my old
// website for school and universities and then the universe trace and add more other types also
// where they create a impact"). One account opens all of them; the side menu shows the app you're
// in, and the switcher at its top (and the hub, /hub) moves between them. Shared tools (Messages,
// Collaborate, Calls, Settings) belong to every app.

export type AppId = 'campus' | 'trace' | 'relief' | 'green';

export interface ImpactApp {
  id: AppId;
  name: string;
  /** One line under the name. */
  tagline: string;
  /** What it changes, for the hub and the landing page. */
  impact: string;
  /** The app's accent (its icon tile and glow). */
  color: string;
  /** Addresses that belong to the app. */
  paths: string[];
}

export const APPS: ImpactApp[] = [
  {
    id: 'campus', name: 'UniVersity', tagline: 'Schools and universities', color: '#6366f1',
    impact: 'Courses, grades, attendance, parents, internships and volunteering, run in one place so teachers teach and students learn.',
    paths: ['/student', '/teacher', '/admin', '/parent', '/library', '/marketplace', '/campus-map', '/donations', '/hall', '/impact-league', '/impact-rooms', '/application'],
  },
  {
    id: 'trace', name: 'UniVerse Trace', tagline: 'Every product gets a passport', color: '#ec4899',
    impact: 'Genuine checks for buyers, points for shops, live maps of where products sell and where every shipment is, and fakes caught early.',
    paths: ['/trace', '/carry', '/t', '/b'],
  },
  {
    id: 'relief', name: 'UniVerse Relief', tagline: 'Help that reaches people fast', color: '#f97316',
    impact: 'People post what they need, neighbours and NGOs offer what they have, and a live map matches them, from food and water to a lift to the clinic.',
    paths: ['/relief'],
  },
  {
    id: 'green', name: 'UniVerse Green', tagline: 'Climate action you can prove', color: '#10b981',
    impact: 'Log trees planted, kilometres cycled and waste recycled, see the CO₂ saved, and take on weekly challenges with your team.',
    paths: ['/green'],
  },
];

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** Shared tools every app uses (Messages and Settings live at each role's own address). */
export function isShared(path: string) {
  return /^\/(student|teacher|admin)\/(inbox|settings)(\/|$)/.test(path) || under(path, '/admin/announcements')
    || ['/collab', '/boards', '/code', '/tasks', '/docs', '/sheets', '/slides', '/spaces', '/studio', '/files', '/calls', '/call', '/notifications', '/people', '/hub', '/console'].some((b) => under(path, b));
}

/** The app an address belongs to (null: the hub or a shared tool). */
export function appFor(path: string): ImpactApp | null {
  if (isShared(path)) return null;
  return APPS.find((a) => a.paths.some((p) => under(path, p))) ?? null;
}

export const appById = (id: AppId) => APPS.find((a) => a.id === id)!;

/** Where an app opens for someone: Campus by role, the others at their own page. */
export function appHome(id: AppId, role?: string | null) {
  if (id === 'campus') return role === 'ADMIN' ? '/admin' : role === 'TEACHER' ? '/teacher' : role === 'GUARDIAN' ? '/parent' : '/student';
  return `/${id}`;
}

/** Each role's Messages page (the inbox pages are shared by every app). */
export const inboxFor = (role: string | null | undefined) => (role === 'ADMIN' ? '/admin/inbox' : role === 'TEACHER' ? '/teacher/inbox' : '/student/inbox');
/** Each role's Settings page. */
export const settingsFor = (role: string | null | undefined) => (role === 'ADMIN' ? '/admin/settings' : role === 'TEACHER' ? '/teacher/settings' : '/student/settings');
