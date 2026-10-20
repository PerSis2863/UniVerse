'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { formatDistanceToNowStrict } from 'date-fns';
import { Download, Eye, FileText, ImageIcon, Search, Star, X } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, COLLAB_TABS } from '@/components/layout/SectionTabs';
import { Segmented } from '@/components/ui/Segmented';
import { FilesBrowser, FileViewer, StarButton } from '@/components/files/FilesBrowser';
import { formatBytes } from '@/components/chat/chat-client';
import { authedJson } from '@/lib/authed-fetch';
import { previewKind } from '@/lib/pdf';
import { useAuthStore } from '@/store/auth';

// Collaborate → Files (Stage 5 · B9.13; src/server/space-files.ts filesHub): My files (a personal
// files hub with folders and versions), Recent and Starred across every class and group, and a
// search over file names and the words inside files.

interface HubFile { id: string; name: string; url: string; mime: string; size: number; updatedAt: string; starred: boolean; space: { kind: string; id: string; label: string; href: string }; snippet: string | null }
type View = 'mine' | 'recent' | 'starred';

function HubList({ url, empty, onMine }: { url: string; empty: string; onMine: () => void }) {
  const { data, error, mutate } = useSWR<{ files: HubFile[] }>(url, authedJson);
  const [view, setView] = useState<HubFile | null>(null);
  if (error) return <p className="text-sm text-rose-500">{(error as Error).message}</p>;
  if (!data) return <div className="h-48 rounded-2xl skeleton" />;
  if (!data.files.length) return <div className="panel p-10 text-center text-sm text-zinc-500">{empty}</div>;
  const images = data.files.filter((f) => f.mime.startsWith('image/'));
  return (
    <>
      <ul className="panel divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
        {data.files.map((f) => {
          const canView = f.mime.startsWith('image/') || !!previewKind(f.name, f.mime);
          return (
            <li key={f.id} className="flex items-center gap-2 px-4 py-3">
              {f.mime.startsWith('image/') ? <ImageIcon className="w-5 h-5 text-emerald-500 shrink-0" aria-hidden /> : <FileText className="w-5 h-5 text-indigo-500 shrink-0" aria-hidden />}
              <span className="flex-1 min-w-0 ms-1">
                <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-white">{f.name}</span>
                {f.snippet && <span className="block text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2">{f.snippet}</span>}
                <span className="block text-xs text-zinc-500 truncate">{f.space.kind === 'me'
                  ? <button type="button" onClick={onMine} className="text-indigo-600 dark:text-indigo-300 underline underline-offset-2">{f.space.label}</button>
                  : <Link href={f.space.href} className="text-indigo-600 dark:text-indigo-300 underline underline-offset-2">{f.space.label}</Link>} · {formatBytes(f.size)} · {formatDistanceToNowStrict(new Date(f.updatedAt), { addSuffix: true })}</span>
              </span>
              <StarButton file={f} onChanged={() => void mutate()} />
              {canView && <button type="button" aria-label={`Preview ${f.name}`} onClick={() => setView(f)} className="p-1.5 text-zinc-400 hover:text-indigo-500"><Eye className="w-4 h-4" /></button>}
              <a href={f.url} download={f.name} target="_blank" rel="noopener noreferrer" aria-label={`Download ${f.name}`} className="p-1.5 text-zinc-400 hover:text-indigo-500"><Download className="w-4 h-4" /></a>
            </li>
          );
        })}
      </ul>
      <FileViewer file={view} images={images} onClose={() => setView(null)} />
    </>
  );
}

export default function FilesPage() {
  const userId = useAuthStore((s) => s.user?.id);
  const [view, setView] = useState<View>('mine');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  // Search a moment after typing stops.
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 300); return () => clearTimeout(t); }, [text]);
  const searching = q.length >= 2;

  return (
    <>
      <Topbar title="Files" subtitle="Your own files, and files from every class and group you’re in" />
      <SectionTabs tabs={COLLAB_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="relative flex-1">
              <span className="sr-only">Search files</span>
              <Search className="w-4 h-4 text-zinc-400 absolute start-3 top-1/2 -translate-y-1/2" aria-hidden />
              <input type="search" value={text} onChange={(e) => setText(e.target.value.slice(0, 80))} placeholder="Search names and the words inside files" className="input ps-10" />
              {text && <button type="button" onClick={() => setText('')} aria-label="Clear the search" className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600"><X className="w-4 h-4" /></button>}
            </label>
            {!searching && <Segmented<View> segments={[{ value: 'mine', label: 'My files' }, { value: 'recent', label: 'Recent' }, { value: 'starred', label: 'Starred', icon: <Star className="w-3.5 h-3.5" aria-hidden /> }]} value={view} onChange={setView} label="Show" />}
          </div>

          {searching ? (
            <HubList key={q} onMine={() => { setText(''); setView('mine'); }} url={`/api/files-hub?q=${encodeURIComponent(q)}`} empty={`No files match “${q}”. Search looks at names, and at the words inside PDFs, Word, Excel and text files uploaded from now on.`} />
          ) : view === 'recent' ? (
            <HubList onMine={() => setView('mine')} url="/api/files-hub?view=recent" empty="Nothing changed in the last 90 days in your files, classes or groups." />
          ) : view === 'starred' ? (
            <HubList onMine={() => setView('mine')} url="/api/files-hub?view=starred" empty="Star files (☆) to keep them here, wherever they are." />
          ) : userId ? (
            <FilesBrowser kind="me" id={userId} rootLabel="My files" emptyHint="Keep your own notes, drafts and exports here (up to 100 MB). Only you can see them." />
          ) : null}
        </div>
      </div>
    </>
  );
}
