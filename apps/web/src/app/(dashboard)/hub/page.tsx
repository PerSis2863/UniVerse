'use client';

import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { ArrowRight, MessageSquare, PenTool, Phone, Settings, Sparkles } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import Link from '@/components/ui/Link';
import { AppIcon } from '@/components/apps/AppIcon';
import { ImpactWallet } from '@/components/hub/ImpactWallet';
import { AskUniverse } from '@/components/hub/AskUniverse';
import { InviteButton } from '@/components/apps/InviteButton';
import { APPS, appHome, inboxFor, settingsFor, type AppId } from '@/lib/apps';
import { fetcher } from '@/lib/fetcher';
import { fmt } from '@/lib/instruments';
import { useNow } from '@/lib/use-now';
import { useAuthStore } from '@/store/auth';

// The hub of UniVerse Impact (src/lib/apps.ts): every app with what it has changed so far, from
// GET /hub (src/server/hub.ts), and the tools they share. Where people land after signing in when
// they didn't pick an app on the website. The Impact Wallet (src/components/hub/ImpactWallet.tsx) sits
// under the apps.

interface HubStats { apps: Record<AppId, { value: number; label: string; mine?: { value: number; label: string } | null }>; total: { people: number } }

const EASE = [0.22, 1, 0.36, 1] as const;

export default function HubPage() {
  const user = useAuthStore((s) => s.user);
  const now = useNow();
  const { data } = useSWR<HubStats>('/hub', fetcher);
  const hour = now ? new Date(now).getHours() : 12;
  const hello = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const role = user?.role ?? 'STUDENT';
  const tools = [
    { href: inboxFor(role), label: 'Messages', icon: MessageSquare },
    { href: '/collab', label: 'Collaborate', icon: PenTool },
    { href: '/calls', label: 'Calls', icon: Phone },
    { href: settingsFor(role), label: 'Settings', icon: Settings },
  ];
  return (
    <>
      <Topbar title="All apps" subtitle="UniVerse Impact: one account, apps that change something" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-8">
          <section className="trace-hero relative overflow-hidden rounded-[32px] p-7 sm:p-10 text-white">
            <span aria-hidden className="passport-glow passport-glow-a" />
            <div className="relative">
              <span className="passport-pill">UniVerse Impact</span>
              <motion.h2 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }} className="mt-4 text-4xl sm:text-5xl font-black tracking-tight">
                {hello}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}.
              </motion.h2>
              <p className="mt-3 text-lg text-zinc-300 max-w-2xl">Pick where you want to make a difference today. Every app uses the same account, messages and files.</p>
              <dl className="mt-7 grid grid-cols-2 sm:grid-cols-5 gap-3">
                {APPS.map((a, i) => (
                  <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.06, duration: 0.6, ease: EASE }} className="rounded-2xl bg-white/[0.06] ring-1 ring-white/10 px-4 py-3">
                    <dt className="text-[11px] uppercase tracking-wider text-zinc-400">{data?.apps[a.id]?.label ?? a.tagline}</dt>
                    <dd className="mt-1 font-mono text-2xl tabular-nums" style={{ color: a.color }}>{data ? fmt(data.apps[a.id]?.value ?? 0) : '…'}</dd>
                  </motion.div>
                ))}
              </dl>
            </div>
          </section>

          <AskUniverse role={role} />

          <section aria-labelledby="apps-h">
            <h2 id="apps-h" className="text-lg font-bold text-zinc-900 dark:text-white">Your apps</h2>
            <div className="mt-3 grid md:grid-cols-2 gap-4">
              {APPS.map((a, i) => {
                const mine = data?.apps[a.id]?.mine;
                return (
                  <motion.div key={a.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.07, duration: 0.6, ease: EASE }} whileHover={{ y: -3 }}>
                    <Link href={appHome(a.id, role)} className="group panel relative block h-full overflow-hidden p-6">
                      <span aria-hidden className="absolute -right-16 -top-16 w-48 h-48 rounded-full blur-3xl opacity-20 group-hover:opacity-35 transition-opacity duration-500" style={{ background: a.color }} />
                      <div className="relative flex items-start gap-4">
                        <AppIcon id={a.id} size={52} />
                        <div className="min-w-0 flex-1">
                          <h3 className="text-xl font-bold text-zinc-900 dark:text-white">{a.name}</h3>
                          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{a.tagline}</p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-zinc-400 group-hover:translate-x-1 transition-transform" aria-hidden />
                      </div>
                      <p className="relative mt-4 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">{a.impact}</p>
                      {mine && <p className="relative mt-4 inline-flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] px-3 py-1 text-xs font-semibold text-zinc-700 dark:text-zinc-200"><Sparkles className="w-3.5 h-3.5" style={{ color: a.color }} aria-hidden />You: {fmt(mine.value)} {mine.label}</p>}
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </section>

          <ImpactWallet role={role} />

          <section aria-labelledby="tools-h">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="tools-h" className="text-lg font-bold text-zinc-900 dark:text-white me-auto">Shared by every app</h2>
              <InviteButton text="I’m using UniVerse Impact: one account for school, product checks, helping neighbours and climate action. Join me:" />
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {tools.map((t) => (
                <Link key={t.label} href={t.href} className="panel p-4 flex items-center gap-3 hover:-translate-y-0.5 transition-transform">
                  <span className="w-10 h-10 rounded-2xl grid place-items-center bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"><t.icon className="w-5 h-5" aria-hidden /></span>
                  <span className="font-semibold text-sm text-zinc-900 dark:text-white">{t.label}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
