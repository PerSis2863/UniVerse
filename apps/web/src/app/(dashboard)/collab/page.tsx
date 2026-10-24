'use client';

import { Topbar } from '@/components/layout/Topbar';
import { CollabTabs } from '@/components/layout/SectionTabs';
import { CollabHome } from '@/components/collab/CollabHome';

// Collaborate → Home (M17): everything shared with others, from every tool, in one place.
export default function CollabPage() {
  return (
    <>
      <Topbar title="Collaborate" subtitle="Boards, documents, tasks, code and files you work on together" />
      <CollabTabs />
      <CollabHome />
    </>
  );
}
