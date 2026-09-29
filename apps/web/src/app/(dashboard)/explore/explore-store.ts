'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';

// Explore mode keeps everything in this browser only: nothing is sent to the server, nobody else
// sees it, and the person's real role never changes. "Reset preview" clears it.

export interface Opening { id: string; title: string; type: string; pay: string; skills: string[]; description: string; createdAt: string }
export interface Applicant { id: string; openingId: string; name: string; headline: string; skills: string[]; note: string; status: 'NEW' | 'SHORTLISTED' | 'DECLINED' | 'HIRED' }
export interface Proposal { id: string; gigId: string; gigTitle: string; client: string; rate: string; message: string; sentAt: string; status: 'SENT' | 'VIEWED' | 'SHORTLISTED' | 'HIRED' }

export interface ExploreState {
  startup: { name: string; tagline: string; sector: string; stage: string; website: string; openings: Opening[]; applicants: Applicant[] };
  freelancer: { headline: string; rate: string; skills: string[]; about: string; available: boolean; proposals: Proposal[]; saved: string[] };
}

const empty = (name: string): ExploreState => ({
  startup: { name: name ? `${name.split(' ')[0]}'s Startup` : 'My Startup', tagline: 'Building something students love', sector: 'EdTech', stage: 'Idea', website: '', openings: [], applicants: [] },
  freelancer: { headline: 'Student freelancer', rate: '₹500 / hour', skills: ['Design', 'Writing'], about: '', available: true, proposals: [], saved: [] },
});

const key = (userId?: string) => `universe-explore-${userId ?? 'guest'}`;

export function useExplore() {
  const user = useAuthStore((s) => s.user);
  const [state, setState] = useState<ExploreState>(() => empty(user?.name ?? ''));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key(user?.id));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- load the saved preview after mount (browser storage)
      if (raw) setState({ ...empty(user?.name ?? ''), ...JSON.parse(raw) });
    } catch {
      /* storage unavailable: start fresh */
    }
    setLoaded(true);
  }, [user?.id, user?.name]);

  const update = (fn: (s: ExploreState) => ExploreState) =>
    setState((prev) => {
      const next = fn(prev);
      try {
        localStorage.setItem(key(user?.id), JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  const reset = () => {
    try {
      localStorage.removeItem(key(user?.id));
    } catch {
      /* ignore */
    }
    setState(empty(user?.name ?? ''));
  };

  return { state, update, reset, loaded };
}

export const uid = () => Math.random().toString(36).slice(2, 10);

// Sample people who "apply" to a role posted in the preview.
const SAMPLE_APPLICANTS: Omit<Applicant, 'id' | 'openingId' | 'status'>[] = [
  { name: 'Aarav Mehta', headline: '3rd-year CS student', skills: ['React', 'Node.js', 'SQL'], note: 'Built two campus apps; keen to ship fast with a small team.' },
  { name: 'Priya Nair', headline: 'Design student, UI/UX', skills: ['Figma', 'User research', 'Branding'], note: 'I redesigned our college fest app; happy to share my portfolio.' },
  { name: 'Rohan Das', headline: 'MBA, marketing', skills: ['Growth', 'Content', 'Analytics'], note: 'Grew a student club page to 12k followers in six months.' },
  { name: 'Sara Khan', headline: 'Data science minor', skills: ['Python', 'Pandas', 'Dashboards'], note: 'Can set up your metrics and weekly reports.' },
];

export function sampleApplicantsFor(opening: Opening): Applicant[] {
  const picks = [...SAMPLE_APPLICANTS].sort(() => Math.random() - 0.5).slice(0, 3);
  return picks.map((p) => ({ ...p, id: uid(), openingId: opening.id, status: 'NEW' as const }));
}
