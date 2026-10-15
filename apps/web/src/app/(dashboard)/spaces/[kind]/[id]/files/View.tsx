'use client';

import { usePathParams } from '@/hooks/usePathParams';
import { AddressLoading } from '@/components/layout/AddressLoading';
import { Topbar } from '@/components/layout/Topbar';
import { FilesBrowser } from '@/components/files/FilesBrowser';

// A space's files hub (Stage 4 · 3.7; the browser is components/files/FilesBrowser.tsx, shared
// with My files in Collaborate → Files).

function SpaceFilesPage({ kind, id }: { kind: string; id: string }) {
  return (
    <>
      <Topbar title="Files" subtitle="Everyone in this space can add files and new versions" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <FilesBrowser kind={kind} id={id} back={{ href: `/spaces/${kind}/${id}`, label: 'Space' }} emptyHint="Upload slides, notes and handouts for everyone in this space." />
      </div>
    </>
  );
}

// Served for every address from the page built once with "open" (page.tsx, cloudflare/page-routes.gen.ts):
// the values come from the address, read in the browser.
export default function SpaceFilesPageRoute() {
  const p = usePathParams('/spaces/[kind]/[id]/files');
  return p ? <SpaceFilesPage key={`${p.kind}/${p.id}`} kind={p.kind} id={p.id} /> : <AddressLoading portal />;
}
