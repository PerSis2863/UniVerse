'use client';

import { AnimatePresence, m as motion } from 'framer-motion';
import { CampusScene, GreenScene, PlayScene, ReliefScene, TraceScene } from './HeroScenes';
import { Accent, Tag } from './bits';
import { useChosenApp } from '@/lib/chosen-app';
import type { AppId } from '@/lib/apps';

// The left side of sign in and sign up: the app chosen on the tabs (src/lib/chosen-app.ts), its
// headline and its live picture (the same scenes as the landing page), changing as the tabs change.

const SIDE: Record<AppId, { tag: string; head: string; accent: string; text: string; card: React.ReactNode; foot: string }> = {
  campus: { tag: 'UniVersity / free for students', head: 'The school day runs', accent: 'itself.', text: 'Classes, grades and messages in one calm place.', card: <CampusScene />, foot: '13 languages / 8 question types / $0 for students' },
  trace: { tag: 'UniVerse Trace / free to start', head: 'Every product gets a', accent: 'passport.', text: 'Scan the code. See if it’s real.', card: <TraceScene />, foot: '10,000 passports free / no card' },
  relief: { tag: 'UniVerse Relief / free', head: 'Help that reaches people', accent: 'fast.', text: 'Ask for help or offer it, on one live map.', card: <ReliefScene />, foot: 'for people in need, volunteers and NGOs' },
  play: { tag: 'UniVerse Play / free', head: 'Games that teach', accent: 'something.', text: 'Quick games that teach. Solo or with friends.', card: <PlayScene />, foot: 'solo or up to 8 in a room' },
  green: { tag: 'UniVerse Green / free', head: 'Climate action you can', accent: 'prove.', text: 'Log what you do. See the CO₂ you save.', card: <GreenScene />, foot: 'for schools, companies and clubs' },
};

export function AuthShowcase() {
  const app = useChosenApp();
  const s = SIDE[app];
  return (
    <AnimatePresence mode="wait">
      <motion.div key={app} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10, transition: { duration: 0.18 } }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
        <Tag>{s.tag}</Tag>
        <h2 className="mt-6 text-5xl xl:text-6xl font-bold tracking-[-0.035em] leading-[1.04] text-white">{s.head} <Accent>{s.accent}</Accent></h2>
        <p className="mt-5 text-zinc-300 text-base leading-relaxed max-w-md">{s.text}</p>
        <div className="mt-9">{s.card}</div>
        <p className="mt-6 font-mono text-xs text-zinc-400">{s.foot}</p>
      </motion.div>
    </AnimatePresence>
  );
}
