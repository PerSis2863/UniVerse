'use client';

import Link from 'next/link';
import { ArrowRight, Users } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { CampusItemManager } from '@/components/campus/CampusItems';

export default function AdminStudentLifePage() {
  return (
    <>
      <Topbar title="Student Life Management" subtitle="Campus events, services and useful links for everyone" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-2">
          <CampusItemManager kind="EVENT" label="Event" categories={['Career', 'Social', 'Academic', 'Impact', 'Sports', 'Culture']} />
          <CampusItemManager kind="SERVICE" label="Service" categories={['Dining', 'Cafés', 'Transport', 'Store', 'Health', 'Housing', 'Other']} />
          <CampusItemManager kind="LINK" label="Link" categories={['Academics', 'Library', 'Careers', 'IT & Accounts', 'Wellbeing', 'Other']} />
          <Link href="/admin/monitoring/associations" className="group rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] p-5 flex items-center gap-4 hover:border-indigo-500/30 transition-colors">
            <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center"><Users className="w-5 h-5 text-white" /></span>
            <div className="flex-1">
              <p className="font-bold text-zinc-900 dark:text-white">Clubs & associations</p>
              <p className="text-sm text-zinc-500">Review club requests and manage memberships</p>
            </div>
            <ArrowRight className="w-5 h-5 text-zinc-400 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </>
  );
}
