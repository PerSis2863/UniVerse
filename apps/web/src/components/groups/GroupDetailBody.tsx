'use client';

import useSWR from 'swr';
import { FileText, ImageIcon, Loader2, ExternalLink } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { useLiveInterval } from '@/lib/realtime-client';
import { safeHref } from '@/lib/safe-href';

interface GroupDetail {
  description: string | null;
  members: { role: string; user: { id: string; name: string; avatar: string | null } }[];
  files: { id: string; body: string; imageUrl: string | null; createdAt: string; author: { name: string } }[];
}

function fileName(url: string) {
  const raw = decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? 'file');
  return raw.replace(/-[A-Za-z0-9]{20,}(\.\w+)$/, '$1');
}

/** Real members and files shared in the group's chat. */
export function GroupDetailBody({ groupId }: { groupId: string | number }) {
  const refreshInterval = useLiveInterval(60_000, 60_000);
  const { data, isLoading, error } = useSWR<GroupDetail>(`/api/groups/${groupId}`, authedJson, { refreshInterval });

  if (isLoading) return <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>;
  if (error) return <p className="text-sm text-zinc-500">{(error as Error).message}</p>;
  if (!data) return null;

  return (
    <>
      {data.description && <p className="text-sm text-zinc-600 dark:text-zinc-400">{data.description}</p>}

      <div>
        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Members ({data.members.length})</h4>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {data.members.map((m) => (
            <div key={m.user.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
              {m.user.avatar ? (
                <img src={m.user.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xs text-white font-bold">
                  {m.user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">{m.user.name}</div>
                <div className="text-xs text-zinc-400">{m.role === 'ADMIN' ? 'Admin' : m.role === 'MODERATOR' ? 'Moderator' : 'Member'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Shared files</h4>
        {data.files.length === 0 ? (
          <p className="text-sm text-zinc-500">No files shared yet. Share photos and documents from the chat.</p>
        ) : (
          <div className="space-y-2">
            {data.files.map((f) => {
              const url = f.imageUrl ?? f.body.replace(/^📎 /, '').trim();
              return (
                <a key={f.id} href={safeHref(url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border border-zinc-200 dark:border-zinc-800">
                  {f.imageUrl ? <ImageIcon className="w-4 h-4 text-indigo-400 shrink-0" /> : <FileText className="w-4 h-4 text-indigo-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-700 dark:text-zinc-300 truncate">{fileName(url)}</div>
                    <div className="text-[11px] text-zinc-400">Shared by {f.author.name}</div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                </a>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
