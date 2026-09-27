'use client';

import { Link2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { CampusItemList } from '@/components/campus/CampusItems';

export default function LinksPage() {
  return (
    <>
      <Topbar title="Apps & Links" subtitle="Useful tools and portals for your campus" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <CampusItemList
            kind="LINK"
            guide={{
              icon: Link2,
              title: 'Your campus shortcuts',
              description: 'The library, learning platform, exam portal and other tools your campus uses — all one tap away.',
              steps: ['Your admin adds the links your campus uses', 'They appear here, grouped by category', 'Open any of them in a new tab'],
              example: [
                { title: 'University Library', meta: 'Research · journals and e-books', right: 'Open' },
                { title: 'Exam Portal', meta: 'Academics · results and hall tickets', right: 'Open' },
              ],
            }}
          />
        </div>
      </div>
    </>
  );
}
