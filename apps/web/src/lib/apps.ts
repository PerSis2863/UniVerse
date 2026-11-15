// UniVerse Impact is a home for several apps, each making a difference somewhere (the owner, 24 Oct
// 2026: "there are a lot of different mini software or website in the main website like my old
// website for school and universities and then the universe trace and add more other types also
// where they create a impact"). One account opens all of them; the side menu shows the app you're
// in, and the switcher at its top (and the hub, /hub) moves between them. Shared tools (Messages,
// Collaborate, Calls, Settings) belong to every app.

export type AppId = 'campus' | 'trace' | 'relief' | 'green' | 'play' | 'travel';

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
  /** Still finding its first people: a small "Lab" tag wherever the app is named (M112, the council's
   *  launch focus; on 5 Dec 2026 the owner decides, from each app's real-people numbers, to keep it,
   *  leave it in the lab or remove it). */
  lab?: boolean;
}

export const APPS: ImpactApp[] = [
  {
    id: 'campus', name: 'UniVersity', tagline: 'Schools and universities', color: '#6366f1',
    impact: 'Courses, grades and parents, in one place.',
    paths: ['/student', '/teacher', '/admin', '/parent', '/library', '/marketplace', '/campus-map', '/donations', '/hall', '/impact-league', '/impact-rooms', '/application'],
  },
  {
    id: 'trace', name: 'UniVerse Trace', tagline: 'Every product gets a passport', color: '#fe81d1',
    impact: 'Real or fake, in one scan.',
    paths: ['/trace', '/carry', '/t', '/b', '/dpp', '/supply'], lab: true,
  },
  {
    id: 'relief', name: 'UniVerse Relief', tagline: 'Help that reaches people fast', color: '#f97316',
    impact: 'Needs and offers, matched on a live map.',
    paths: ['/relief', '/aid'], lab: true,
  },
  {
    id: 'green', name: 'UniVerse Green', tagline: 'Climate action you can prove', color: '#10b981',
    impact: 'Log an action, see the CO₂ saved.',
    paths: ['/green'], lab: true,
  },
  {
    // M183 (the owner, 15 Nov 2026): where to go, eat, sleep and what to see, trips planned day by day
    // with friends, and booking through partners.
    id: 'travel', name: 'UniVerse Travel', tagline: 'Plan trips, anywhere in the world', color: '#0ea5e9',
    impact: 'Guides, day-by-day plans and greener trips.',
    paths: ['/travel'], lab: true,
  },
  {
    id: 'play', name: 'UniVerse Play', tagline: 'Games that teach something', color: '#e46bdb',
    impact: 'Thirteen games that teach, solo or with friends.',
    paths: ['/play'], lab: true,
  },
];

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

const SHARED = ['/collab', '/boards', '/code', '/tasks', '/docs', '/sheets', '/slides', '/spaces', '/studio', '/files', '/calls', '/call', '/notifications', '/people', '/hub', '/console', '/admin/announcements'];
const SHARED_ROLE = /^\/(student|teacher|admin)\/(inbox|settings)(\/|$)/;

/** Shared tools every app uses (Messages and Settings live at each role's own address). */
export function isShared(path: string) {
  return SHARED_ROLE.test(path) || SHARED.some((b) => under(path, b));
}

/** M133: the page's app on <html data-app> before the first paint (the root layout's head script), so a
 *  page never shows the wrong app's colour first (globals.css M132); AppBackdrop keeps it right after.
 *  The same rules as appFor and useChosenApp: the address's app, otherwise ?app=, the app chosen in
 *  this tab, UniVersity. M186: when the owner shows only some apps (window.__uvApps, written by the
 *  Worker, or the list this device kept), a chosen app that's hidden gives way to the first shown one,
 *  and a style hides every `[data-uv-app]` of a hidden app (and with one app, every `[data-uv-many]`: tabs, lists of apps) before the page is drawn (src/lib/shown-apps.ts). */
export const appHeadScript = `try{var p=location.pathname,A=${JSON.stringify(APPS.map((a) => [a.id, a.paths]))},u=function(b){return p===b||p.indexOf(b+'/')===0},a=null,S=null,K=[];if(!(${SHARED_ROLE}.test(p)||${JSON.stringify(SHARED)}.some(u)))A.some(function(x){return x[1].some(u)&&(a=x[0])});try{S=window.__uvApps||JSON.parse(localStorage.getItem('uv-apps')||'null')}catch(e){}if(Array.isArray(S))A.forEach(function(x){S.indexOf(x[0])>=0&&K.push(x[0])});if(K.length===A.length)K=[];if(!a){var c=new URLSearchParams(location.search).get('app')||sessionStorage.getItem('uv-app');a=A.some(function(x){return x[0]===c})?c:'campus';if(K.length&&K.indexOf(a)<0)a=K[0]}document.documentElement.dataset.app=a;if(K.length){var s=document.createElement('style');s.id='uv-apps-css';s.textContent='[data-uv-app]'+K.map(function(i){return':not([data-uv-app="'+i+'"])'}).join('')+(K.length===1?',[data-uv-many]':'')+'{display:none!important}';document.head.appendChild(s)}}catch(e){}`;

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
