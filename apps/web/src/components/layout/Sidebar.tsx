'use client';
import Link from '@/components/ui/Link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { BarChart3, Briefcase, Check, ChevronsUpDown, HandHeart, Leaf, LayoutGrid, KeyRound, Megaphone, PenTool, Radar, ScanLine, ShieldCheck, Sparkles, Truck, Trophy, Wallet, type LucideIcon } from 'lucide-react';
import { APPS, appFor, appHome, inboxFor, settingsFor, type AppId } from '@/lib/apps';
import { AppIcon } from '@/components/apps/AppIcon';
import { userCan } from '@/lib/permissions';
import {
  LayoutDashboard, Users,
  MessageSquare, Settings, LogOut,
  GraduationCap,
  Folder, ChevronDown,
  Coffee, Globe2, Map
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { LanguageMenu } from './LanguageMenu';
import { AnimatePresence, m as motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { useLanguageStore } from '@/store/language';
import { useOptimisticPath } from '@/lib/nav-pending';

export type NavItem = {
  href?: string;
  label: string;
  icon: LucideIcon;
  subItems?: { href: string; label: string; also?: string[] }[];
  action?: string;
  /** Other pages that count as this entry (tabs of the same section). */
  also?: string[];
};

/**
 * Staff with custom roles (Stage 5 · B15.6) get an "Office" group with the admin areas their
 * permissions open, before Messages and Settings.
 */
function withOffice(nav: NavItem[], user: { role?: string; permissions?: string[] }): NavItem[] {
  const subItems = [
    userCan(user, 'fees.view') && { href: '/admin/fees', label: 'School fees' },
    userCan(user, 'staff.manage') && { href: '/admin/staff', label: 'Staff' },
    userCan(user, 'library.manage') && { href: '/admin/library', label: 'Library desk' },
    userCan(user, 'registers.manage') && { href: '/admin/registers', label: 'Registers' },
    userCan(user, 'admissions.review') && { href: '/admin/admissions', label: 'Admissions' },
    // Counsellors (Stage 5 · D13) are staff given this permission; admins reach it from Safety.
    user.role !== 'ADMIN' && userCan(user, 'wellbeing.counsel') && { href: '/admin/wellbeing', label: 'Wellbeing requests' },
    (userCan(user, 'import.run') || userCan(user, 'export.run')) && { href: '/admin/import', label: 'Import & export' },
  ].filter((x): x is { href: string; label: string } => !!x);
  if (!subItems.length) return nav;
  const at = Math.max(0, nav.length - 2);
  return [...nav.slice(0, at), { label: 'Office', icon: Briefcase, subItems }, ...nav.slice(at)];
}

/** Whether `pathname` is the page of this entry (its href without a query, or one of `also`). */
const isOn = (pathname: string, href: string | undefined, also?: string[]) => !!href && (pathname === href.split('?')[0] || !!also?.includes(pathname));

/**
 * Pages that are tabs of another menu entry, or only reached from search (Ctrl+K / the search
 * button): listed in search by name. `quick` ones also show before anything is typed.
 */
type SearchPage = { href: string; label: string; keywords?: string; quick?: boolean };
const campusSearch: Record<string, SearchPage[]> = {
  STUDENT: [
    { href: '/student/search/directory', label: 'Student directory', keywords: 'people find students classmates', quick: true },
    { href: '/student/search/internships', label: 'Internship history', keywords: 'placements companies past internships', quick: true },
    { href: '/student/links', label: 'Apps & links', keywords: 'tools portals email library wifi', quick: true },
    { href: '/student/calendar', label: 'Timetable', keywords: 'calendar schedule classes week' },
    { href: '/student/planner', label: 'Study planner', keywords: 'plan study schedule ai deadlines revision' },
    { href: '/student/information', label: 'Information', keywords: 'news announcements updates' },
    { href: '/student/attendance', label: 'Attendance', keywords: 'absences presence' },
    { href: '/student/quizzes', label: 'Quizzes', keywords: 'tests exams' },
    { href: '/student/assignments', label: 'Assignments', keywords: 'essay homework coursework hand in' },
    { href: '/student/tutor', label: 'AI tutor', keywords: 'ai study flashcards practice' },
    { href: '/student/voice-tutor', label: 'Voice tutor', keywords: 'talk speak ai tutor voice' },
    { href: '/calls', label: 'Calls', keywords: 'call log phone video voice history missed' },
    { href: '/notifications', label: 'Notifications', keywords: 'alerts bell snooze mute push daily summary digest mark read' },
    { href: '/student/passport', label: 'Skills passport', keywords: 'cv profile share employers' },
    { href: '/student/offline?scan=1', label: 'Scan from the teacher’s screen', keywords: 'offline no internet moving qr codes scan note quiz announcement class' },
    { href: '/student/internships/match', label: 'Skills match', keywords: 'jobs internships ngo projects match my skills gap what to learn career' },
    { href: '/student/internships/applications', label: 'Application tracker', keywords: 'jobs internships applications applied interview offer next step notes cv career tracker' },
    { href: '/student/internships/interview', label: 'Interview practice', keywords: 'job interview questions practise answer feedback star filler words career' },
    { href: '/student/internships/mentors', label: 'Mentors and alumni', keywords: 'mentor alumni career advice book a call one to one graduates' },
    { href: '/donations', label: 'My donations', keywords: 'donate donation give money ngo charity receipt 80g tax' },
    { href: '/student/life/board', label: 'Campus board', keywords: 'marketplace buy sell swap free second hand books bike carpool ride share lift housing room flat rent' },
    { href: '/student/life/board?section=rides', label: 'Carpool and rides', keywords: 'carpool ride share lift airport travel together' },
    { href: '/student/life/board?section=housing', label: 'Housing board', keywords: 'room flat rent housing roommate accommodation pg' },
    { href: '/student/life/everyday', label: 'Pre-order food', keywords: 'cafeteria canteen dining food order lunch dinner pre-order pickup' },
    { href: '/student/life/rooms', label: 'Room booking', keywords: 'reserve study room' },
    { href: '/campus-map', label: 'Campus map', keywords: 'map buildings where is my class room free study room now live events campus twin' },
    { href: '/student/life/medical', label: 'Medical & disability', keywords: 'health doctor accessibility' },
    { href: '/student/life/everyday', label: 'Everyday life', keywords: 'dining menu food transport campus' },
    { href: '/student/life/events', label: 'Campus events', keywords: 'rsvp check in qr ticket event' },
    { href: '/student/life/lost-found', label: 'Lost & found', keywords: 'lost found missing item' },
    { href: '/impact-rooms', label: 'Impact rooms', keywords: 'ngo volunteer sponsor donate time pledge impact call project updates' },
    { href: '/impact-league', label: 'Impact League', keywords: 'sdg challenge competition team hackathon universities demo day prize' },
    { href: '/studio?tool=convert', label: 'Convert files', keywords: 'word to pdf docx pdf to jpg png excel csv convert change format' },
    { href: '/studio?tool=compress', label: 'Compress files', keywords: 'compress reduce shrink smaller file size pdf photo image video zip' },
  ],
  TEACHER: [
    { href: '/teacher/tutor', label: 'AI tutor', keywords: 'ai course sources flashcards' },
    { href: '/donations', label: 'My donations', keywords: 'donate donation give money ngo charity receipt 80g tax' },
    { href: '/teacher/live', label: 'Send to phones with no internet', keywords: 'offline no internet moving qr codes projector note quiz announcement class' },
    { href: '/calls', label: 'Calls', keywords: 'call log phone video voice history missed' },
    { href: '/notifications', label: 'Notifications', keywords: 'alerts bell snooze mute push daily summary digest mark read' },
    { href: '/impact-rooms', label: 'Impact rooms', keywords: 'ngo volunteer sponsor impact call report project updates' },
    { href: '/impact-league', label: 'Impact League', keywords: 'sdg challenge competition teams universities mentor judge demo day prize' },
    { href: '/studio?tool=convert', label: 'Convert files', keywords: 'word to pdf docx pdf to jpg png excel csv convert change format' },
    { href: '/studio?tool=compress', label: 'Compress files', keywords: 'compress reduce shrink smaller file size pdf photo image video zip' },
    { href: '/campus-map', label: 'Campus map', keywords: 'map buildings where is my class room free study room now live events campus twin' },
  ],
  ADMIN: [
    { href: '/calls', label: 'Calls', keywords: 'call log phone video voice history missed' },
    { href: '/admin/impact-reports/donations', label: 'Donations', keywords: 'ngo donations give money 80g pan receipts stripe csv charity' },
    { href: '/admin/monitoring/board', label: 'Campus board reports', keywords: 'marketplace reported posts moderation rides housing' },
    { href: '/admin/monitoring/meals', label: 'Cafeteria pre-orders', keywords: 'kitchen canteen dining food orders pickup ready' },
    { href: '/notifications', label: 'Notifications', keywords: 'alerts bell snooze mute push daily summary digest mark read' },
    { href: '/impact-rooms', label: 'Impact rooms', keywords: 'ngo volunteer sponsor impact call report project updates' },
    { href: '/impact-league', label: 'Impact League', keywords: 'sdg challenge competition teams universities mentor judge demo day prize credentials' },
    { href: '/studio?tool=convert', label: 'Convert files', keywords: 'word to pdf docx pdf to jpg png excel csv convert change format' },
    { href: '/studio?tool=compress', label: 'Compress files', keywords: 'compress reduce shrink smaller file size pdf photo image video zip' },
    { href: '/campus-map', label: 'Campus map', keywords: 'map buildings where is my class room free study room now live events campus twin usage heatmap' },
  ],
};

/** The other apps' pages, findable from every role's search. */
const APP_SEARCH: SearchPage[] = [
  { href: '/hub', label: 'All apps', keywords: 'apps switch universe impact hub home' },
  { href: '/hub', label: 'Impact Wallet', keywords: 'wallet balance credits points co2 people helped history all apps' },
  { href: '/trace', label: 'Trace console', keywords: 'trace brand products passport codes batch' },
  { href: '/trace/map', label: 'Market map', keywords: 'where it sells map scans cities live' },
  { href: '/trace/tracking', label: 'Track a shipment', keywords: 'shipment truck delivery driver eta live position' },
  { href: '/trace/wallet', label: 'Trace wallet', keywords: 'points cash out scan and earn shop' },
  { href: '/trace/vault', label: 'My vault', keywords: 'own ownership transfer warranty proof second hand' },
  { href: '/relief', label: 'Relief map', keywords: 'help need food water shelter medical volunteer aid disaster' },
  { href: '/green', label: 'Log a climate action', keywords: 'green climate co2 tree recycle cycle carbon' },
];
export const searchOnlyPages: Record<string, SearchPage[]> = Object.fromEntries(Object.entries(campusSearch).map(([role, list]) => [role, [...list, ...APP_SEARCH]]));

// M27 (the owner, 26 Oct 2026: "the university is too much big… people will get confuse… merge few
// of them together"): a few plainly named groups per role. Pages that were their own entries are now
// tabs of the section they belong to (src/components/layout/SectionTabs.tsx), so every link,
// bookmark and notification still works, and search (CommandPalette) finds every tab.
export const navByRole: Record<string, NavItem[]> = {
  STUDENT: [
    { href: '/student', label: 'Home', icon: LayoutDashboard, also: ['/student/calendar', '/student/planner', '/student/information'] },
    // Messages and calls are one entry: the Calls list is a tab inside Messages.
    { href: '/student/inbox', label: 'nav.inbox', icon: MessageSquare, also: ['/calls', '/notifications'] },
    {
      label: 'Learn', icon: GraduationCap,
      subItems: [
        { href: '/student/courses', label: 'Courses', also: ['/student/live', '/student/offline', '/student/groups', '/marketplace'] },
        { href: '/student/assignments', label: 'Assignments & grades', also: ['/student/grades', '/student/attendance', '/student/quizzes', '/student/mastery'] },
        { href: '/student/blackboard', label: 'Course board & AI tutor', also: ['/student/tutor', '/student/voice-tutor', '/student/oral-practice', '/student/semester', '/student/tutoring', '/student/reels'] },
        { href: '/student/skills', label: 'Resources & library', also: ['/student/knowledge-hub', '/library'] },
      ]
    },
    { href: '/collab', label: 'Collaborate', icon: PenTool, also: ['/boards', '/code', '/tasks', '/docs', '/sheets', '/slides', '/spaces', '/studio', '/files'] },
    {
      label: 'Careers & impact', icon: Briefcase,
      subItems: [
        { href: '/student/internships', label: 'Internships & careers', also: ['/student/internships/match', '/student/internships/applications', '/student/internships/interview', '/student/internships/mentors'] },
        { href: '/student/impact/ngo-marketplace', label: 'Projects & volunteering', also: ['/student/impact/ai-match', '/student/impact/startups', '/student/impact/companies', '/student/impact/shifts', '/impact-rooms', '/impact-league'] },
        { href: '/student/credentials', label: 'Credentials & passport', also: ['/student/passport', '/student/impact/leaderboard', '/student/impact/edu-society'] },
      ]
    },
    {
      label: 'Campus', icon: Coffee,
      subItems: [
        { href: '/student/life/associations', label: 'nav.student_life', also: ['/student/life/board', '/student/life/rooms', '/student/life/medical', '/student/life/everyday', '/student/life/events', '/student/life/lost-found', '/campus-map'] },
        { href: '/student/community', label: 'nav.community' },
        { href: '/student/support', label: 'Help & safety', also: ['/student/wellbeing', '/student/beesafe'] },
      ]
    },
    { href: '/student/administrative/personal', label: 'My records', icon: Folder, also: ['/student/administrative/documents', '/student/administrative/accounting', '/student/administrative/scholarships', '/student/choices'] },
    { href: '/student/settings?section=language', label: 'nav.settings', icon: Settings },
  ],
  TEACHER: [
    { href: '/teacher', label: 'Home', icon: LayoutDashboard },
    { href: '/teacher/inbox', label: 'nav.messages', icon: MessageSquare, also: ['/calls', '/notifications'] },
    {
      label: 'Teach', icon: GraduationCap,
      subItems: [
        { href: '/teacher/courses', label: 'Courses & live class', also: ['/teacher/live', '/marketplace'] },
        { href: '/teacher/assignments', label: 'Marking & attendance', also: ['/teacher/quizzes', '/teacher/grades', '/teacher/attendance'] },
        { href: '/teacher/students', label: 'nav.students', also: ['/teacher/early-warning', '/teacher/analytics', '/teacher/mastery', '/teacher/meetings', '/teacher/forms'] },
        { href: '/teacher/blackboard', label: 'Course board & AI tutor', also: ['/teacher/tutor', '/teacher/reels'] },
        { href: '/teacher/calendar', label: 'nav.timetable', also: ['/teacher/staff'] },
      ]
    },
    { href: '/collab', label: 'Collaborate', icon: PenTool, also: ['/boards', '/code', '/tasks', '/docs', '/sheets', '/slides', '/spaces', '/studio', '/files'] },
    {
      label: 'Campus & research', icon: Globe2,
      subItems: [
        { href: '/teacher/collaborations', label: 'Research & NGO work', also: ['/teacher/network', '/teacher/collaborations/projects', '/teacher/mentorship', '/impact-rooms', '/impact-league'] },
        { href: '/teacher/services/rooms', label: 'nav.room_reservation', also: ['/campus-map'] },
        { href: '/teacher/knowledge', label: 'Knowledge & library', also: ['/library'] },
      ]
    },
    { href: '/teacher/settings?section=profile', label: 'nav.settings', icon: Settings },
  ],
  ADMIN: [
    { href: '/admin', label: 'nav.overview', icon: LayoutDashboard },
    { href: '/admin/inbox', label: 'nav.messages', icon: MessageSquare, also: ['/calls', '/notifications', '/admin/announcements'] },
    {
      label: 'People', icon: Users,
      subItems: [
        { href: '/admin/users', label: 'nav.users', also: ['/admin/staff', '/admin/admissions', '/admin/roles', '/admin/import', '/admin/integrations/oneroster', '/admin/integrations/developer', '/admin/integrations/chat-apps', '/admin/integrations/lti'] },
        { href: '/admin/approvals', label: 'Approvals' },
        { href: '/admin/safety', label: 'Safety & wellbeing', also: ['/admin/safety/chats', '/admin/safety/policy', '/admin/wellbeing'] },
        { href: '/admin/audit', label: 'Activity Log' },
      ]
    },
    {
      label: 'Academics', icon: GraduationCap,
      subItems: [
        { href: '/admin/courses', label: 'nav.courses', also: ['/marketplace'] },
        { href: '/admin/attendance', label: 'nav.attendance' },
        { href: '/admin/quizzes', label: 'nav.quizzes' },
        { href: '/admin/timetable', label: 'nav.timetable_management' },
        { href: '/admin/knowledge-hub', label: 'Knowledge & library', also: ['/admin/library', '/library'] },
      ]
    },
    {
      label: 'Operations', icon: Settings,
      subItems: [
        { href: '/admin/administrative', label: 'nav.administrative' },
        { href: '/admin/finances', label: 'Money & billing', also: ['/admin/fees', '/admin/finances/reconciliation', '/admin/billing'] },
        { href: '/admin/internships', label: 'nav.internships' },
        { href: '/admin/student-life', label: 'Campus & student life', also: ['/admin/monitoring/rooms', '/admin/monitoring/associations', '/admin/monitoring/events', '/admin/monitoring/lost-found', '/admin/monitoring/board', '/admin/monitoring/meals', '/campus-map'] },
        { href: '/admin/registers', label: 'Registers' },
      ]
    },
    {
      label: 'Impact', icon: Globe2,
      subItems: [
        { href: '/admin/partnerships', label: 'Partners & sponsors', also: ['/admin/network', '/admin/partners'] },
        { href: '/admin/impact-reports', label: 'Impact reports', also: ['/admin/impact-reports/shifts', '/admin/impact-reports/volunteering', '/admin/impact-reports/donations', '/impact-rooms', '/impact-league'] },
        { href: '/admin/credentials', label: 'Credentials', also: ['/admin/certifications'] },
      ]
    },
    { href: '/admin/insights', label: 'Insights', icon: BarChart3, also: ['/admin/early-warning', '/admin/analytics', '/admin/reports', '/admin/reports/report-cards', '/admin/reports/grading-scale', '/admin/impact-metrics', '/admin/insights/warehouse'] },
    { href: '/collab', label: 'Collaborate', icon: PenTool, also: ['/boards', '/code', '/tasks', '/docs', '/sheets', '/slides', '/spaces', '/studio', '/files'] },
    { href: '/admin/settings', label: 'nav.settings', icon: Settings },
  ],
};

/** The shared tools at the end of every app's menu. */
const sharedNav = (role: string): NavItem[] => [
  { href: inboxFor(role), label: 'nav.messages', icon: MessageSquare, also: ['/calls', '/notifications', ...(role === 'ADMIN' ? ['/admin/announcements'] : [])] },
  { href: '/collab', label: 'Collaborate', icon: PenTool, also: ['/boards', '/code', '/tasks', '/docs', '/sheets', '/slides', '/spaces', '/studio', '/files'] },
  { href: settingsFor(role), label: 'nav.settings', icon: Settings },
];

/** Each app's own menu (src/lib/apps.ts). UniVersity keeps the school menus by role (navByRole). */
const APP_NAV: Record<Exclude<AppId, 'campus'>, NavItem[]> = {
  trace: [
    { href: '/trace', label: 'Console', icon: ScanLine, also: ['/trace/print'] },
    { href: '/trace/map', label: 'Market map', icon: Globe2 },
    { href: '/trace/tracking', label: 'Tracking', icon: Truck },
    { href: '/trace/radar', label: 'Radar', icon: Radar },
    { href: '/trace/insights', label: 'Insights', icon: Sparkles },
    { href: '/trace/campaigns', label: 'Campaigns', icon: Megaphone },
    { href: '/trace/wallet', label: 'Wallet', icon: Wallet },
    { href: '/trace/vault', label: 'My vault', icon: KeyRound },
  ],
  relief: [
    { href: '/relief', label: 'Live map', icon: Map },
    { href: '/relief/mine', label: 'My requests & tasks', icon: HandHeart },
  ],
  green: [
    { href: '/green', label: 'My impact', icon: Leaf },
    { href: '/green/teams', label: 'Teams & leaderboard', icon: Trophy },
  ],
};

/** The menu for the app someone is in. */
function navFor(app: AppId | null, user: { role: string; owner?: boolean; permissions?: string[] }): NavItem[] {
  const owner: NavItem[] = user.owner ? [{ href: '/console', label: 'Owner console', icon: ShieldCheck }] : [];
  const hub: NavItem = { href: '/hub', label: 'All apps', icon: LayoutGrid };
  if (!app) return [...owner, hub, ...APPS.map((a): NavItem => ({ href: appHome(a.id, user.role), label: a.name, icon: { campus: GraduationCap, trace: ScanLine, relief: HandHeart, green: Leaf }[a.id] })), ...sharedNav(user.role)];
  if (app === 'campus') {
    const base = [...owner, ...(navByRole[user.role] ?? navByRole.STUDENT)];
    return user.role === 'TEACHER' ? withOffice(base, user) : base;
  }
  return [...owner, ...APP_NAV[app], ...sharedNav(user.role)];
}

const LAST_APP = 'uv-last-app';
/** The app last used: shared pages (Messages, Collaborate…) keep its menu. */
function useCurrentApp(pathname: string): AppId | null {
  const here = appFor(pathname)?.id ?? null;
  const last = useSyncExternalStore((cb) => { window.addEventListener('storage', cb); return () => window.removeEventListener('storage', cb); }, () => { try { return localStorage.getItem(LAST_APP) as AppId | null; } catch { return null; } }, () => null);
  useEffect(() => { if (here) try { localStorage.setItem(LAST_APP, here); } catch { /* private mode */ } }, [here]);
  if (pathname === '/hub') return null;
  return here ?? (last && APPS.some((a) => a.id === last) ? last : null);
}

/** The app switcher at the top of the menu: the app you're in, and every other one a tap away. */
function AppSwitcher({ app, role, onPick }: { app: AppId | null; role: string; onPick?: () => void }) {
  const [open, setOpen] = useState(false);
  const current = APPS.find((a) => a.id === app);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  return (
    <div className="relative px-3 pb-2">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu"
        className="w-full flex items-center gap-3 rounded-2xl px-2.5 py-2 bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.07] transition-colors text-start">
        <AppIcon id={app ?? 'hub'} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-white truncate">{current?.name ?? 'UniVerse Impact'}</span>
          <span className="block text-[11px] text-zinc-400 truncate">{current?.tagline ?? 'All your apps'}</span>
        </span>
        <ChevronsUpDown className="w-4 h-4 text-zinc-400" aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="menu" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={spring.snappy}
            className="absolute left-3 right-3 top-full z-20 mt-1 rounded-2xl border border-white/10 bg-[#0b1a24] p-1.5 shadow-2xl">
            {APPS.map((a) => (
              <Link key={a.id} role="menuitem" href={appHome(a.id, role)} onClick={() => { setOpen(false); onPick?.(); }} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.06]">
                <AppIcon id={a.id} size={28} />
                <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-white truncate">{a.name}</span><span className="block text-[11px] text-zinc-400 truncate">{a.tagline}</span></span>
                {a.id === app && <Check className="w-4 h-4 text-pink-300" aria-label="Open now" />}
              </Link>
            ))}
            <Link role="menuitem" href="/hub" onClick={() => { setOpen(false); onPick?.(); }} className="mt-1 flex items-center gap-2 rounded-xl px-2 py-2 text-[13px] font-semibold text-zinc-300 hover:bg-white/[0.06] border-t border-white/[0.06]">
              <LayoutGrid className="w-4 h-4" aria-hidden />All apps
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItemComponent({ 
  item, 
  pathname, 
  onClose,
  isOpen,
  onToggle,
  glide,
}: { 
  item: NavItem; 
  pathname: string; 
  onClose?: () => void;
  isOpen: boolean;
  onToggle: () => void;
  /** The highlight slides to the new entry (on screen); otherwise it just moves. */
  glide: boolean;
}) {
  const { t } = useLanguageStore();
  const hasActiveChild = item.subItems?.some(sub => isOn(pathname, sub.href, sub.also) || pathname.startsWith(sub.href + '/'));
  const active = pathname === item.href || (item.href && item.href !== '/' && pathname.startsWith(item.href)) || hasActiveChild;

  if (item.subItems) {
    return (
      <div className="space-y-1">
        <button
          onClick={onToggle}
          aria-expanded={isOpen}
          data-tour-hrefs={item.subItems.map((s) => s.href.split('?')[0]).join(' ')}
          className={cn('sidebar-item w-full justify-between', active && !isOpen && 'active')}
        >
          <div className="flex items-center gap-3">
            <item.icon className="w-[18px] h-[18px] flex-shrink-0 text-tint-text" strokeWidth={2} />
            <span>{t(item.label)}</span>
          </div>
          <ChevronDown className={cn('w-3.5 h-3.5 text-zinc-400 transition-transform duration-300', !isOpen && '-rotate-90')} strokeWidth={2.5} />
        </button>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key="sub"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={spring.smooth}
              className="overflow-hidden"
            >
              <div className="ps-[1.875rem] space-y-0.5 pt-0.5">
                {item.subItems.map(sub => {
                  const on = isOn(pathname, sub.href, sub.also);
                  return (
                    <Link key={sub.href} href={sub.href} data-vt="fade" data-tour-href={sub.href.split('?')[0]} onClick={onClose} aria-current={on ? 'page' : undefined}
                      className={cn('sidebar-item pill-host relative block text-[15px] py-1.5', on && 'active')}>
                      {on && <motion.span layoutId={glide ? 'sidebar-pill' : undefined} transition={spring.snappy} className="sidebar-pill" />}
                      <span className="relative block truncate">{t(sub.label)}</span>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (item.action) {
    return (
      <button className="sidebar-item w-full justify-start">
        <item.icon className="w-[18px] h-[18px] flex-shrink-0 text-tint-text" strokeWidth={2} />
        <span>{t(item.label)}</span>
      </button>
    );
  }

  if (item.href) {
    const on = isOn(pathname, item.href, item.also);
    return (
      <Link href={item.href} data-vt="fade" data-tour-href={item.href.split('?')[0]} onClick={onClose} aria-current={on ? 'page' : undefined}
        className={cn('sidebar-item pill-host relative block', on && 'active')}>
        {on && <motion.span layoutId={glide ? 'sidebar-pill' : undefined} transition={spring.snappy} className="sidebar-pill" />}
        <div className="relative flex items-center gap-3">
          <item.icon className="w-[18px] h-[18px] flex-shrink-0 text-tint-text" strokeWidth={2} />
          <span>{t(item.label)}</span>
        </div>
      </Link>
    );
  }

  return null;
}


const WIDE = '(min-width: 1024px)';
const subscribeWide = (onChange: () => void) => {
  const q = window.matchMedia(WIDE);
  q.addEventListener('change', onChange);
  return () => q.removeEventListener('change', onChange);
};

export function Sidebar({ isOpen = false, onClose }: { isOpen?: boolean, onClose?: () => void }) {
  const { user, logout } = useAuthStore();
  // The tapped entry lights up at once, not when its page has downloaded.
  const pathname = useOptimisticPath(usePathname());
  const router = useRouter();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const { t } = useLanguageStore();
  // On a phone the closed menu is off screen: sliding its highlight there on every page change made
  // framer-motion measure the page on each frame of the tab switch.
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => true);
  const app = useCurrentApp(pathname);

  // Escape closes the mobile navigation sheet. The page behind doesn't scroll while it's open
  // because the backdrop and the sheet's fixed parts take no finger scrolling (touch-none) and its
  // list doesn't pass scrolling on (overscroll-contain). Not a class or style on <body>: changing
  // the body's touch-action restyles every element on the page (about 0.2 s on a slow phone).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!user) return null;

  // The owner console link exists only for the owner (the console itself answers "not found" to anyone else).
  const nav = navFor(app, user);
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    try {
      const { auth } = await import('@/lib/firebase');
      await auth.signOut();
    } catch (error) {
      console.warn('Firebase signOut failed:', error);
    }
    logout();
    router.push('/login');
  };

  return (
    <>
      {/* Mobile backdrop (fades in/out; sits above the mobile header and tab bar) */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-[95] bg-black/50 lg:hidden transition-opacity duration-300 touch-none",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      />

      <aside
        aria-label="Navigation"
        className={cn(
          "dark fixed start-0 top-0 bottom-0 w-[min(84vw,320px)] lg:w-64 glass-sidebar border-e border-[var(--sidebar-border)] flex flex-col z-[100] lg:z-50 sheet-safe-top lg:pt-0 rounded-e-[28px] lg:rounded-none",
          "transition-transform duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform lg:translate-x-0",
          isOpen ? "translate-x-0 shadow-2xl lg:shadow-none" : "-translate-x-full rtl:translate-x-full"
        )}
      >
        {/* Brand */}
      <div className="flex items-center gap-3 px-5 h-16 touch-none lg:touch-manipulation">
        <UniverseLogo size="md" animated={false} withGlow={false} />
        <div className="min-w-0">
          <div className="font-bold text-[17px] leading-tight tracking-tight text-zinc-900 dark:text-white">UniVerse Impact</div>
          <div className="text-[12px] text-zinc-500 dark:text-zinc-400 font-medium">{user.owner ? 'Owner' : user.role === 'ADMIN' ? 'Admin' : user.role === 'TEACHER' ? 'Teacher' : 'Member'}</div>
        </div>
      </div>
      <AppSwitcher app={app} role={user.role} onPick={onClose} />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overscroll-contain min-h-0 px-3 pb-4 space-y-0.5 custom-scrollbar">
        {nav.map((item, i) => (
          <NavItemComponent 
            key={i} 
            item={item} 
            pathname={pathname} 
            onClose={onClose}
            isOpen={openIndex === i || (item.subItems?.some(sub => isOn(pathname, sub.href, sub.also) || pathname.startsWith(sub.href + '/')) && openIndex === null) ? true : false}
            onToggle={() => setOpenIndex(openIndex === i ? null : i)}
            glide={isOpen || wide}
          />
        ))}
      </nav>

      {/* User */}
      <div className="px-3 pt-3 sheet-safe-bottom lg:pb-4 touch-none lg:touch-manipulation" style={{ boxShadow: 'inset 0 0.5px 0 var(--separator)' }}>
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl">
          <div className="w-9 h-9 rounded-full bg-gradient-to-b from-[#a5abb8] to-[#848993] flex items-center justify-center text-[13px] font-semibold text-white flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-zinc-900 dark:text-white truncate">{user.name}</div>
            <div className="text-[12px] text-zinc-500 truncate">{user.email}</div>
          </div>
        </div>
        {/* Phones have no top bar with the language button. */}
        <LanguageMenu row className="lg:hidden mt-1" />
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-xl text-[15px] text-red-700 dark:text-[var(--ios-red)] hover:bg-[var(--fill)] transition-colors">
          <LogOut className="w-[18px] h-[18px]" />
          <span>{t('nav.logout')}</span>
        </button>
        <div className="px-3 pt-2 pb-1 flex gap-3 text-[12px] text-zinc-400 dark:text-zinc-500">
          <Link href="/terms" target="_blank" className="hover:text-tint-text">Terms</Link>
          <Link href="/privacy" target="_blank" className="hover:text-tint-text">Privacy</Link>
          <Link href="/policies" target="_blank" className="hover:text-tint-text">Policies</Link>
          <Link href="/contact" target="_blank" className="hover:text-tint-text">Contact</Link>
        </div>
      </div>
    </aside>
    </>
  );
}
