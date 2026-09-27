'use client';

import { HandHeart } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { NgoProjectBoard } from '@/components/impact/NgoProjectBoard';

export default function NeedsBoardPage() {
  return (
    <>
      <Topbar title="Needs & Support Board" subtitle="Where NGOs need help most urgently" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <NgoProjectBoard
            sort="deadline"
            guide={{
              icon: HandHeart,
              title: 'NGO needs will appear here',
              description: 'When partner NGOs post projects, the ones closing soonest show at the top so you can help where it matters most.',
              steps: ['Check projects closing soon (shown in red)', 'Apply with your skills and availability', 'Get notified when the NGO reviews your application'],
            }}
          />
        </div>
      </div>
    </>
  );
}
