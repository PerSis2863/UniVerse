'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Accessibility, Bell, Building2, Camera, Check, ChevronLeft, ChevronRight, Globe, HardDrive, HelpCircle, Loader2, LogOut, Moon, Palette, Search, Shield, ShieldCheck, Sparkles, Sun, SunMoon, Trash2, User, Users, Vibrate, X, Bold, Contrast, Type, Underline, Captions, type LucideIcon } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import Link from '@/components/ui/Link';
import { Switch } from '@/components/ui/Switch';
import { confirmDialog } from '@/components/ui/Dialogs';
import { LowDataToggle } from '@/components/settings/LowDataToggle';
import { QuietHoursSetting } from '@/components/settings/QuietHoursSetting';
import { ParentHoursSetting } from '@/components/settings/ParentHoursSetting';
import { NotificationPermissionPrompt } from '@/components/pwa/NotificationPermissionPrompt';
import { api } from '@/lib/api';
import { applyTheme, getSavedTheme, type Theme } from '@/lib/theme';
import { LANGUAGES, type Language } from '@/lib/i18n';
import { useLanguageStore } from '@/store/language';
import { useAiStore } from '@/store/ai';
import { useAuthStore } from '@/store/auth';
import { appReduceMotion, captionsByDefault, hapticsOn, readingAid, setAppReduceMotion, setCaptionsByDefault, setHaptics, setReadingAid, setTextSize, textSize, type ReadingAid, type TextSize } from '@/lib/display-prefs';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';

// Sections show one at a time: their heavier parts (sign-in security, account deletion, school
// settings, consents, family) load when their section opens.
const sectionLoading = () => <div className="h-28 rounded-2xl skeleton" />;
const AccountSecurity = dynamic(() => import('@/components/settings/AccountSecurity').then((m) => m.AccountSecurity), { ssr: false, loading: sectionLoading });
const DeleteAccount = dynamic(() => import('@/components/settings/DeleteAccount').then((m) => m.DeleteAccount), { ssr: false, loading: sectionLoading });
const OrganizationSettings = dynamic(() => import('@/components/settings/OrganizationSettings').then((m) => m.OrganizationSettings), { ssr: false, loading: sectionLoading });
const ConsentsPanel = dynamic(() => import('@/components/settings/ConsentsPanel').then((m) => m.ConsentsPanel), { ssr: false, loading: sectionLoading });
const DownloadMyData = dynamic(() => import('@/components/settings/DownloadMyData').then((m) => m.DownloadMyData), { ssr: false, loading: sectionLoading });
const NetworkVisibility = dynamic(() => import('@/components/settings/NetworkVisibility').then((m) => m.NetworkVisibility), { ssr: false, loading: sectionLoading });
const GuardianShareCard = dynamic(() => import('@/components/settings/GuardianShareCard').then((m) => m.GuardianShareCard), { ssr: false, loading: sectionLoading });
const GuardianAccountsCard = dynamic(() => import('@/components/settings/GuardianAccountsCard').then((m) => m.GuardianAccountsCard), { ssr: false, loading: sectionLoading });
const GuardianContactsCard = dynamic(() => import('@/components/settings/GuardianContactsCard').then((m) => m.GuardianContactsCard), { ssr: false, loading: sectionLoading });
const RecentSignIns = dynamic(() => import('@/components/security/RecentSignIns').then((m) => m.RecentSignIns), { ssr: false, loading: sectionLoading });

// Settings for every portal, like the Settings app on a phone: a searchable list of sections; on
// phones a section slides in over the list (Back, or swipe from the left edge, slides it away), on
// bigger screens the list stays on the left. Everything shown is real and saves (no sample data).

type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';
interface Me { id?: string; name?: string; email?: string; phone?: string | null; avatar?: string | null; role?: string; emailNotifications?: boolean; createdAt?: string }
interface Section { id: string; label: string; icon: typeof User; tile: string; keywords: string; roles?: Role[] }

const SECTIONS: Section[] = [
  { id: 'profile', label: 'Profile', icon: User, tile: '#8e8e93', keywords: 'name photo phone email account picture avatar' },
  { id: 'appearance', label: 'Appearance', icon: Palette, tile: '#5856d6', keywords: 'theme dark light mode text size bigger font motion animation vibration haptics' },
  { id: 'language', label: 'Language & data', icon: Globe, tile: '#007aff', keywords: 'language translate english french hindi spanish low data saver 2g weak connection voice only calls' },
  { id: 'notifications', label: 'Notifications', icon: Bell, tile: '#ff3b30', keywords: 'push email alerts notify' },
  { id: 'privacy', label: 'Privacy & security', icon: Shield, tile: '#0a84ff', keywords: 'password two-step 2fa sign in devices visibility network privacy security' },
  { id: 'family', label: 'Parent or guardian', icon: Users, tile: '#34c759', keywords: 'parent guardian family share progress', roles: ['STUDENT'] },
  { id: 'consents', label: 'My consents', icon: ShieldCheck, tile: '#30b0c7', keywords: 'consent permissions agree' },
  { id: 'ai', label: 'AI features', icon: Sparkles, tile: '#af52de', keywords: 'ai assistant chatbot tutor' },
  { id: 'organization', label: 'Organization', icon: Building2, tile: '#ff9500', keywords: 'school name security status demo login', roles: ['ADMIN'] },
  { id: 'storage', label: 'Storage & data', icon: HardDrive, tile: '#636366', keywords: 'storage offline cache clear download export delete account data' },
  { id: 'help', label: 'Help & about', icon: HelpCircle, tile: '#32ade6', keywords: 'help support contact terms privacy policy accessibility version about legal' },
];

const mb = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

export function SettingsApp({ role }: { role: Role }) {
  const sections = useMemo(() => SECTIONS.filter((s) => !s.roles || s.roles.includes(role)), [role]);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const { t } = useLanguageStore();

  // ?section=… opens that section (links from elsewhere), and the address follows what's open.
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('section');
    if (s && sections.some((x) => x.id === s)) setOpen(s); // eslint-disable-line react-hooks/set-state-in-effect
    else if (window.matchMedia('(min-width: 768px)').matches) setOpen('profile');
  }, [sections]);
  const go = (id: string | null) => {
    setOpen(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('section', id); else url.searchParams.delete('section');
    window.history.replaceState(null, '', url.toString());
  };

  const term = q.trim().toLowerCase();
  const shown = term ? sections.filter((s) => `${s.label} ${s.keywords}`.toLowerCase().includes(term)) : sections;
  const current = sections.find((s) => s.id === open) ?? null;

  // Phones: swipe right from the left edge closes the section, like iOS.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { const p = e.touches[0]; swipe.current = p.clientX < 28 ? { x: p.clientX, y: p.clientY } : null; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = swipe.current;
    swipe.current = null;
    const p = e.changedTouches[0];
    if (s && p.clientX - s.x > 70 && Math.abs(p.clientY - s.y) < 60) go(null);
  };

  const list = (
    <div className="space-y-3">
      <label className="relative block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search settings" aria-label="Search settings" className="input pl-10" />
        {q && <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-zinc-400 hover:text-zinc-600"><X className="w-4 h-4" /></button>}
      </label>
      <div className="ios-list inset-separators">
        {shown.map((s) => (
          <button key={s.id} type="button" onClick={() => go(s.id)} aria-current={open === s.id ? 'page' : undefined}
            className={cn('ios-cell relative isolate w-full text-left text-[15px] text-zinc-900 dark:text-white')}>
            {open === s.id && <motion.span layoutId="settings-row" transition={spring.snappy} className="absolute inset-0 -z-10 hidden md:block bg-gradient-to-r from-indigo-500/15 to-fuchsia-500/10" />}
            <span className="ios-icon-tile" style={{ background: s.tile }}><s.icon className="w-[17px] h-[17px]" strokeWidth={2.2} /></span>
            <span className="flex-1 truncate">{s.label}</span>
            <ChevronRight className="w-4 h-4 text-zinc-400" strokeWidth={2.5} />
          </button>
        ))}
        {!shown.length && <p className="p-4 text-sm text-zinc-500">No settings match “{q}”.</p>}
      </div>
      <SignOut />
    </div>
  );

  return (
    <>
      <Topbar title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {/* Bigger screens: list and section side by side. */}
          <div className="hidden md:flex gap-6 items-start">
            <div className="w-72 shrink-0 sticky top-4">{list}</div>
            <div className="flex-1 min-w-0">
              <AnimatePresence mode="wait">
                {current && (
                  <motion.div key={current.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                    <SectionBody id={current.id} role={role} title={current.label} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          {/* Phones: the list, and the open section sliding in over it. */}
          <div className="md:hidden relative" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <motion.div animate={{ opacity: current ? 0 : 1, x: current ? -40 : 0 }} transition={spring.smooth} aria-hidden={!!current} inert={!!current} className={cn(current && 'pointer-events-none')}>{list}</motion.div>
            <AnimatePresence>
              {current && (
                <motion.div key={current.id} initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={spring.smooth} className="absolute inset-x-0 top-0 min-h-full">
                  <button type="button" onClick={() => go(null)} className="mb-3 -ml-1 inline-flex items-center gap-0.5 text-[17px] text-tint-text pressable"><ChevronLeft className="w-6 h-6" /> Settings</button>
                  <SectionBody id={current.id} role={role} title={current.label} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6 space-y-4">
      <div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{title}</h2>
        {subtitle && <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ icon: Icon, title, desc, children }: { icon?: typeof User; title: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-[var(--fill)]">
      <div className="flex items-start gap-3 min-w-0">
        {Icon && <Icon className="w-5 h-5 mt-0.5 text-tint-text shrink-0" />}
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-white">{title}</p>
          {desc && <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function SectionBody({ id, role, title }: { id: string; role: Role; title: string }) {
  switch (id) {
    case 'profile': return <Profile role={role} />;
    case 'appearance': return <Appearance />;
    case 'language': return <LanguageData />;
    case 'notifications': return <Notifications role={role} />;
    case 'privacy':
      return (
        <Card title={title} subtitle="Who can see you, how you sign in, and your devices">
          <Link href="/privacy-choices" target="_blank" className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-[var(--fill)] hover:opacity-90">
            <span><span className="block text-sm font-medium text-zinc-900 dark:text-white">Your privacy choices</span><span className="block text-xs text-zinc-500 mt-0.5">What you control, and how to download or delete your data.</span></span>
            <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
          </Link>
          <NetworkVisibility />
          <AccountSecurity />
          <RecentSignIns />
        </Card>
      );
    case 'family': return <div className="space-y-6"><GuardianAccountsCard /><GuardianContactsCard /><GuardianShareCard /></div>;
    case 'consents': return <ConsentsPanel embedded />;
    case 'ai': return <AiFeatures />;
    case 'organization': return <Card title={title} subtitle="Your school on UniVerse"><OrganizationSettings /></Card>;
    case 'storage': return <Storage role={role} />;
    case 'help': return <HelpAbout />;
    default: return null;
  }
}

// ── Profile: real details, editable name, phone and photo ─────────────────────────────────────
function Profile({ role }: { role: Role }) {
  const setUser = useAuthStore((s) => s.setUser);
  const authUser = useAuthStore((s) => s.user);
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState<null | 'save' | 'photo'>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get('/users/me').then((r) => { setMe(r.data); setName(r.data?.name ?? ''); setPhone(r.data?.phone ?? ''); }).catch(() => setMe({}));
  }, []);

  const save = async (patch: Record<string, unknown>, done: string) => {
    try {
      const r = await api.patch('/users/me', patch);
      setMe((m) => ({ ...m, ...r.data }));
      if (authUser) setUser({ ...authUser, ...(r.data.name ? { name: r.data.name } : {}), ...(r.data.avatar !== undefined ? { avatar: r.data.avatar } : {}) });
      toast.success(done);
    } catch (e) {
      toast.error((e as Error).message || 'Couldn’t save.');
    }
  };
  const saveDetails = async () => {
    setBusy('save');
    await save({ name: name.trim(), phone: phone.trim() || null }, 'Profile saved');
    setBusy(null);
  };
  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast.error('Choose a photo.'); return; }
    setBusy('photo');
    try {
      const { uploadChatFile } = await import('@/components/chat/chat-client');
      await save({ avatar: await uploadChatFile(f) }, 'Photo updated');
    } catch (e) { toast.error((e as Error).message || 'Couldn’t upload the photo.'); }
    setBusy(null);
  };

  if (!me) return <div className="skeleton h-72 rounded-3xl" />;
  const changed = name.trim() !== (me.name ?? '') || phone.trim() !== (me.phone ?? '');
  return (
    <Card title="Profile" subtitle="How others see you on UniVerse">
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => file.current?.click()} className="relative w-20 h-20 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-2xl font-black flex items-center justify-center shrink-0 group" aria-label="Change photo">
          {/* eslint-disable-next-line @next/next/no-img-element -- the person's own uploaded photo */}
          {me.avatar ? <img src={me.avatar} alt="" className="w-full h-full object-cover" /> : (me.name ?? '?').charAt(0).toUpperCase()}
          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">{busy === 'photo' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}</span>
        </button>
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
        <div className="min-w-0">
          <p className="font-semibold text-zinc-900 dark:text-white truncate">{me.name}</p>
          <p className="text-sm text-zinc-500 truncate">{me.email}</p>
          <span className="inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-500/15 to-fuchsia-500/15 text-tint-text">{role === 'ADMIN' ? 'Admin' : role === 'TEACHER' ? 'Teacher' : 'Student'}</span>
          {me.avatar && <button type="button" onClick={() => void save({ avatar: null }, 'Photo removed')} className="block text-xs text-rose-500 mt-1">Remove photo</button>}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="space-y-1"><span className="text-xs font-medium text-zinc-500">Full name</span><input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
        <label className="space-y-1"><span className="text-xs font-medium text-zinc-500">Phone (for account recovery)</span><input className="input" value={phone} maxLength={30} inputMode="tel" placeholder="+91 …" onChange={(e) => setPhone(e.target.value)} /></label>
        <label className="space-y-1 sm:col-span-2"><span className="text-xs font-medium text-zinc-500">Email (your sign-in, can’t be changed here)</span><input className="input opacity-70" value={me.email ?? ''} readOnly /></label>
      </div>
      <AnimatePresence>
        {changed && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring.snappy} className="flex justify-end overflow-hidden">
            <button type="button" className="btn-primary" disabled={busy === 'save' || name.trim().length < 2} onClick={() => void saveDetails()}>{busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />} Save changes</button>
          </motion.div>
        )}
      </AnimatePresence>
      {role === 'STUDENT' && (
        <Link href="/application" className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.06] hover:border-indigo-500/40 transition-colors">
          <span><span className="block font-semibold text-sm text-zinc-900 dark:text-white">Teach or represent an NGO on UniVerse</span><span className="block text-xs text-zinc-500 mt-0.5">Apply for a staff account, or check an application you already sent.</span></span>
          <ChevronRight className="w-4 h-4 text-indigo-500 shrink-0" />
        </Link>
      )}
    </Card>
  );
}

// ── Appearance & accessibility
/** A segmented choice with a gliding two-tone highlight. */
function Choice<T extends string>({ value, options, onPick, id }: { value: T; options: [T, string, typeof Sun?][]; onPick: (v: T, e: React.MouseEvent) => void; id: string }) {
return (
  <div className="grid gap-1 p-1 rounded-2xl bg-[var(--fill)]" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    {options.map(([v, label, Icon]) => (
      <button key={v} type="button" onClick={(e) => onPick(v, e)} aria-pressed={value === v} className={cn('relative isolate py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors', value === v ? 'text-white' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white')}>
        {value === v && <motion.span layoutId={`appearance-${id}`} transition={spring.snappy} className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500" />}
        {Icon && <Icon className="w-4 h-4" />}{label}
      </button>
    ))}
  </div>
);
}

// Reading aids in Settings → Appearance (src/lib/display-prefs.ts; styles in globals.css).
const AIDS: [ReadingAid, LucideIcon, string, string][] = [
  ['bold', Bold, 'Bold text', 'Everyday text is heavier and easier to read.'],
  ['contrast', Contrast, 'More contrast', 'Hints, dates and borders are darker (or brighter in dark mode).'],
  ['dyslexic', Type, 'Dyslexia-friendly font', 'Uses OpenDyslexic, with a little more space between letters and lines.'],
  ['underline', Underline, 'Underline links', 'Links in text are underlined, not only coloured.'],
];

function Appearance() {
  const [theme, setTheme] = useState<Theme>(() => (typeof window === 'undefined' ? 'dark' : getSavedTheme()));
  const [size, setSize] = useState<TextSize>(() => (typeof window === 'undefined' ? 'default' : textSize()));
  const [reduce, setReduce] = useState(() => typeof window !== 'undefined' && appReduceMotion());
  const [haptics, setHap] = useState(() => typeof window === 'undefined' || hapticsOn());
  const [aids, setAids] = useState<Record<ReadingAid, boolean>>(() => ({ bold: readingAid('bold'), contrast: readingAid('contrast'), dyslexic: readingAid('dyslexic'), underline: readingAid('underline') }));
  const [cc, setCc] = useState(captionsByDefault);
  const pickTheme = (v: Theme, e: React.MouseEvent) => { setTheme(v); applyTheme(v, { from: { x: e.clientX, y: e.clientY } }); };
  return (
    <Card title="Appearance" subtitle="How UniVerse looks and feels on this device">
      <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Theme</p>
        <Choice id="theme" value={theme} onPick={pickTheme} options={[['light', 'Light', Sun], ['dark', 'Dark', Moon], ['system', 'Automatic', SunMoon]]} />
      </div>
      <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Text size</p>
        <Choice id="text" value={size} onPick={(v) => { setSize(v); setTextSize(v); }} options={[['default', 'Default'], ['large', 'Large'], ['larger', 'Larger'], ['largest', 'Largest']]} />
      </div>
      <Row icon={Accessibility} title="Reduce motion" desc="Pages and buttons change without moving or sliding (your device’s own setting is followed too).">
        <Switch checked={reduce} label="Reduce motion" onChange={(on) => { setReduce(on); setAppReduceMotion(on); }} />
      </Row>
      <Row icon={Vibrate} title="Vibration" desc="A light tap when you press buttons and switch tabs (phones).">
        <Switch checked={haptics} label="Vibration" onChange={(on) => { setHap(on); setHaptics(on); }} />
      </Row>
      {AIDS.map(([aid, Icon, title, desc]) => (
        <Row key={aid} icon={Icon} title={title} desc={desc}>
          <Switch checked={aids[aid]} label={title} onChange={(on) => { setAids((a) => ({ ...a, [aid]: on })); setReadingAid(aid, on); }} />
        </Row>
      ))}
      <Row icon={Captions} title="Captions on in calls" desc="Calls start with live captions showing (you can still turn them off in a call).">
        <Switch checked={cc} label="Captions on in calls" onChange={(on) => { setCc(on); setCaptionsByDefault(on); }} />
      </Row>
    </Card>
  );
}

function LanguageData() {
  const { language, setLanguage, t } = useLanguageStore();
  const pick = (code: Language) => { setLanguage(code); toast.success(`Language changed to ${LANGUAGES.find((l) => l.code === code)?.nativeName}`); };
  return (
    <Card title={t('settings.language')} subtitle={t('settings.language_desc')}>
      <LowDataToggle />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {LANGUAGES.map((l) => (
          <button key={l.code} type="button" onClick={() => pick(l.code)} aria-pressed={language === l.code}
            className={cn('relative isolate flex items-center gap-3 p-3.5 rounded-2xl text-left transition-colors', language === l.code ? 'text-zinc-900 dark:text-white' : 'bg-[var(--fill)] hover:opacity-90')}>
            {language === l.code && <motion.span layoutId="language-pick" transition={spring.snappy} className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-r from-indigo-500/20 to-fuchsia-500/15 ring-1 ring-indigo-400/40" />}
            <span className="text-2xl">{l.flag}</span>
            <span className="flex-1"><span className="block font-semibold text-sm">{l.nativeName}</span><span className="block text-xs text-zinc-500">{l.name}</span></span>
            {language === l.code && <Check className="w-4 h-4 text-tint-text" />}
          </button>
        ))}
      </div>
    </Card>
  );
}

function Notifications({ role }: { role: Role }) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => { api.get('/users/me').then((r) => setOn(r.data?.emailNotifications ?? true)).catch(() => setOn(true)); }, []);
  const toggle = async (next: boolean) => {
    setOn(next);
    try { await api.patch('/users/me', { emailNotifications: next }); toast.success(next ? 'Email notifications on' : 'Email notifications off'); }
    catch { setOn(!next); toast.error('Couldn’t save your email preference.'); }
  };
  return (
    <Card title="Notifications" subtitle="How UniVerse reaches you">
      <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">On this device</p><NotificationPermissionPrompt /></div>
      <Row icon={Bell} title="Email notifications" desc={role === 'ADMIN' ? 'New teacher and NGO applications, and messages you miss.' : role === 'TEACHER' ? 'Submissions to grade, messages you miss and reminders.' : 'New grades, credential decisions, messages you miss and quizzes due tomorrow.'}>
        {on === null ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" /> : <Switch checked={on} label="Email notifications" onChange={(v) => void toggle(v)} />}
      </Row>
      <QuietHoursSetting />
      {(role === 'TEACHER' || role === 'ADMIN') && <ParentHoursSetting />}
    </Card>
  );
}

function AiFeatures() {
  const { isChatbotEnabled, setChatbotEnabled } = useAiStore();
  return (
    <Card title="AI features" subtitle="Your assistants and tools">
      <Row icon={Sparkles} title="Floating AI assistant" desc="The assistant button in the corner of every page, for quick questions and help.">
        <Switch checked={isChatbotEnabled} label="Floating AI assistant" onChange={(v) => { setChatbotEnabled(v); toast.success(v ? 'Assistant on' : 'Assistant off'); }} />
      </Row>
    </Card>
  );
}

// ── Storage: what's on this device, and your data ───────────────────────────────────────────
function Storage({ role }: { role: Role }) {
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [clearing, setClearing] = useState(false);
  const measure = () => { navigator.storage?.estimate?.().then((e) => setUsage({ used: e.usage ?? 0, quota: e.quota ?? 0 })).catch(() => {}); };
  useEffect(measure, []);
  const clear = async () => {
    if (!(await confirmDialog({ title: 'Clear data saved on this device?', message: 'Saved offline courses, cached pages and chat history on this device are removed (nothing on your account is deleted). Anything waiting to send offline is lost.', confirmLabel: 'Clear', destructive: true }))) return;
    setClearing(true);
    try {
      if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k);
      const { clearOffline } = await import('@/lib/outbox');
      await clearOffline();
      toast.success('Cleared');
    } catch { toast.error('Couldn’t clear everything.'); }
    setClearing(false);
    measure();
  };
  return (
    <Card title="Storage & data" subtitle="What UniVerse keeps on this device, and your account’s data">
      {usage && usage.quota > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm"><span className="text-zinc-500">Used on this device</span><span className="font-semibold text-zinc-900 dark:text-white">{mb(usage.used)}</span></div>
          <div className="h-2 rounded-full bg-[var(--fill)] overflow-hidden"><motion.div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" initial={{ width: 0 }} animate={{ width: `${Math.max(1, Math.min(100, (usage.used / usage.quota) * 100))}%` }} transition={spring.gentle} /></div>
        </div>
      )}
      {role === 'STUDENT' && (
        <Link href="/student/offline" className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-[var(--fill)] hover:opacity-90">
          <span><span className="block text-sm font-medium text-zinc-900 dark:text-white">Offline courses</span><span className="block text-xs text-zinc-500 mt-0.5">Courses saved to open with no connection.</span></span>
          <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
        </Link>
      )}
      <Row icon={Trash2} title="Clear data on this device" desc="Frees space; your account and everything on it stay as they are.">
        <button type="button" className="btn-secondary btn-sm" disabled={clearing} onClick={() => void clear()}>{clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Clear'}</button>
      </Row>
      <DownloadMyData />
      <DeleteAccount />
    </Card>
  );
}

function HelpAbout() {
  const links: [string, string][] = [['Contact & support', '/contact'], ['Accessibility', '/accessibility'], ['Privacy policy', '/privacy'], ['Terms', '/terms'], ['Security', '/security'], ['Legal notice', '/legal-notice']];
  return (
    <Card title="Help & about" subtitle="Get help, and the small print">
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('universe:open-assistant'))} className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-indigo-500/15 to-fuchsia-500/10 text-left">
        <span><span className="block text-sm font-semibold text-zinc-900 dark:text-white">Ask the help assistant</span><span className="block text-xs text-zinc-500 mt-0.5">Instant answers about using UniVerse, even offline.</span></span>
        <Sparkles className="w-5 h-5 text-fuchsia-500 shrink-0" />
      </button>
      <div className="ios-list inset-separators">
        {links.map(([label, href]) => (
          <Link key={href} href={href} target="_blank" className="ios-cell text-[15px] text-zinc-900 dark:text-white"><span className="flex-1">{label}</span><ChevronRight className="w-4 h-4 text-zinc-400" /></Link>
        ))}
      </div>
      <p className="text-xs text-zinc-500 text-center">UniVerse Impact · made for students, teachers and NGOs</p>
    </Card>
  );
}

function SignOut() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const out = async () => {
    if (!(await confirmDialog({ title: 'Sign out of UniVerse?', confirmLabel: 'Sign out' }))) return;
    try { const { auth } = await import('@/lib/firebase'); await auth.signOut(); } catch { /* signed out locally anyway */ }
    logout();
    router.push('/login');
  };
  return (
    <button type="button" onClick={() => void out()} className="w-full ios-list ios-cell justify-center text-[15px] font-semibold text-rose-500">
      <LogOut className="w-4 h-4" /> Sign out
    </button>
  );
}
