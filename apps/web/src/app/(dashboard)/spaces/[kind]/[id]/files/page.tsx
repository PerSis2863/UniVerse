'use client';

import { use } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { FilesBrowser } from '@/components/files/FilesBrowser';

// A space's files hub (Stage 4 · 3.7; the browser is components/files/FilesBrowser.tsx, shared
// with My files in Collaborate → Files).

export default function SpaceFilesPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = use(params);
  return (
    <>
      <Topbar title="Files" subtitle="Everyone in this space can add files and new versions" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <FilesBrowser kind={kind} id={id} back={{ href: `/spaces/${kind}/${id}`, label: 'Space' }} emptyHint="Upload slides, notes and handouts for everyone in this space." />
      </div>
    </>
  );
}
