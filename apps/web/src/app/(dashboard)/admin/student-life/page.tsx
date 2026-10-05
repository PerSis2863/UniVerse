'use client';

import { useState } from 'react';
import Link from '@/components/ui/Link';
import { ArrowRight, Users } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { CampusItemManager } from '@/components/campus/CampusItems';
import { AdminSearch } from '@/components/admin/AdminPeople';

export default function AdminStudentLifePage() {
  const [q, setQ] = useState('');
  const [showPast, setShowPast] = useState(false);

  return (
    <>
      <Topbar title="Student Life Management" subtitle="Campus events, services and useful links, and who added each one" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <AdminSearch className="flex-1" value={q} onChange={setQ} placeholder="Search titles, places, categories, or who added them (name, email, role)…" />
            <label className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300 shrink-0">
              <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} className="rounded" />
              Include past events and menus
            </label>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <CampusItemManager kind="EVENT" label="Event" query={q} showPast={showPast} categories={['Career', 'Social', 'Academic', 'Impact', 'Sports', 'Culture']} />
            <CampusItemManager kind="MENU" label="Menu" query={q} showPast={showPast} categories={['Breakfast', 'Lunch', 'Dinner', 'Snacks']} />
            <CampusItemManager kind="SERVICE" label="Service" query={q} categories={['Dining', 'Cafés', 'Transport', 'Store', 'Health', 'Housing', 'Other']} />
            <CampusItemManager kind="LINK" label="Link" query={q} categories={['Academics', 'Library', 'Careers', 'IT & Accounts', 'Wellbeing', 'Other']} />
            <Link href="/admin/monitoring/associations" className="group rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] p-5 flex items-center gap-4 hover:border-indigo-500/30 transition-colors">
              <span className="w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center"><Users className="w-5 h-5 text-white" /></span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-zinc-900 dark:text-white">Clubs & associations</p>
                <p className="text-sm text-zinc-500">Review club requests and see every member (name, email, role)</p>
              </div>
              <ArrowRight className="w-5 h-5 shrink-0 text-zinc-400 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
