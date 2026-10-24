'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Link2, Loader2, Phone, Plus, Search, Star, Video, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { haptic } from '@/lib/haptics';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { auraOf } from '@/components/chat/chat-client';

// Favourites at the top of Calls (like the iPhone's): one-tap voice or video calls, shown as contact
// posters (M17); favourites also still ring you in Focus. Plus a call link (like a FaceTime link) to share with anyone.

interface Fav { id: string; name: string; avatar: string | null; online: boolean }

export function Favorites() {
  const router = useRouter();
  const { data, mutate } = useSWR<Fav[]>('/api/calls/favorites', authedJson, { revalidateOnFocus: false });
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const call = async (f: Fav, kind: 'audio' | 'video') => {
    setBusy(f.id + kind);
    haptic('tap');
    try {
      const { id } = await authedJson<{ id: string }>('/api/chat/conversations', { method: 'POST', body: JSON.stringify({ userId: f.id }) });
      const msg = await authedJson<{ id: string }>(`/api/chat/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ type: 'CALL', kind }) });
      router.push(`/call/${msg.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };
  const remove = async (f: Fav) => {
    await mutate((d) => d?.filter((x) => x.id !== f.id), { revalidate: false });
    await authedJson(`/api/calls/favorites?userId=${f.id}`, { method: 'DELETE' }).catch(() => mutate());
  };
  const newLink = async () => {
    try {
      const { path } = await authedJson<{ path: string }>('/api/calls/links', { method: 'POST' });
      const url = `${window.location.origin}${path}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success('Call link copied: anyone on UniVerse with it can join');
      router.push(`${path}?kind=video`);
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5"><Star className="w-4 h-4" />Favourites</h2>
        <div className="flex gap-1">
          {!!data?.length && <button type="button" onClick={() => setEditing(!editing)} className="px-3 py-1.5 rounded-full text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]">{editing ? 'Done' : 'Edit'}</button>}
          <button type="button" onClick={() => void newLink()} className="px-3 py-1.5 rounded-full text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/10 inline-flex items-center gap-1"><Link2 className="w-3.5 h-3.5" /> New call link</button>
        </div>
      </div>
      {/* Contact posters (M17, after the iPhone's): a tall card each, in their colour; tap a button to call. */}
      <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 -mx-1 px-1 snap-x">
        {(data ?? []).map((f, i) => (
          <motion.div key={f.id} layout transition={spring.smooth} className="poster group relative shrink-0 snap-start w-36 h-48 rounded-3xl overflow-hidden text-white" style={{ ['--aura' as string]: auraOf(f.id), ['--i' as string]: i }}>
            <div aria-hidden className="poster-bg absolute inset-0" />
            {f.avatar
              ? <div aria-hidden className="absolute inset-0 bg-cover bg-center opacity-70 mix-blend-luminosity transition-transform duration-500 group-hover:scale-105" style={{ backgroundImage: `url(${f.avatar})` }} />
              : <span aria-hidden className="absolute -top-3 -end-2 text-[5.5rem] font-black leading-none opacity-20 select-none">{f.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>}
            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/60 via-black/25 to-transparent">
              <p className="text-lg font-black leading-tight line-clamp-2" translate="no">{f.name.split(' ')[0]}<span className="block text-xs font-semibold opacity-80 truncate">{f.name.split(' ').slice(1).join(' ') || '\u00a0'}</span></p>
              {editing ? null : (
                <div className="mt-2 flex gap-1.5">
                  {(['audio', 'video'] as const).map((k) => (
                    <motion.button key={k} whileTap={{ scale: 0.88 }} type="button" disabled={!!busy} onClick={() => void call(f, k)} aria-label={`${k === 'video' ? 'Video' : 'Voice'} call ${f.name}`} className="flex-1 h-8 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur flex items-center justify-center">
                      {busy === f.id + k ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : k === 'video' ? <Video className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
            {f.online && <span className="absolute top-3 start-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/30 text-[11px] font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Online</span>}
            {editing && (
              <button type="button" onClick={() => void remove(f)} aria-label={`Remove ${f.name} from favourites`} className="absolute top-2 end-2 w-7 h-7 rounded-full bg-rose-500 text-white flex items-center justify-center shadow"><X className="w-4 h-4" /></button>
            )}
          </motion.div>
        ))}
        {(data?.length ?? 0) < 12 && (
          <button type="button" onClick={() => setAdding(true)} className="shrink-0 snap-start w-36 h-48 rounded-3xl border-2 border-dashed border-zinc-300 dark:border-white/15 text-zinc-500 dark:text-zinc-400 hover:text-indigo-500 hover:border-indigo-400/60 flex flex-col items-center justify-center gap-2 transition-colors">
            <span className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-white/[0.06] flex items-center justify-center"><Plus className="w-5 h-5" /></span>
            <span className="text-sm font-semibold">Add a favourite</span>
          </button>
        )}
      </div>
      <AnimatePresence>{adding && <AddFavorite onClose={() => setAdding(false)} onAdded={() => { setAdding(false); void mutate(); }} />}</AnimatePresence>
    </section>
  );
}

function AddFavorite({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { data: people, isLoading } = useSWR<{ id: string; name: string; avatar: string | null; online: boolean }[]>(`/api/chat/users?q=${encodeURIComponent(debounced)}`, authedJson);
  const add = async (id: string, name: string) => {
    try { await authedJson('/api/calls/favorites', { method: 'POST', body: JSON.stringify({ userId: id }) }); toast.success(`${name.split(' ')[0]} added to favourites`); onAdded(); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div data-sheet initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={spring.smooth} role="dialog" aria-modal="true" aria-label="Add a favourite" className="w-full sm:max-w-md max-h-[80vh] flex flex-col rounded-t-3xl sm:rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 shadow-2xl">
        <div className="p-5 pb-3 flex items-center justify-between"><h3 className="text-lg font-black text-zinc-900 dark:text-white">Add a favourite</h3><button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-5 h-5" /></button></div>
        <div className="px-5 mb-2 relative"><Search className="absolute start-8 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="w-full ps-10 pe-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40" /></div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 sheet-safe-bottom">
          {isLoading && <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>}
          {people?.map((p) => (
            <button key={p.id} type="button" onClick={() => void add(p.id, p.name)} className={cn('w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-zinc-50 dark:hover:bg-white/[0.04] text-start')}>
              <Avatar name={p.name} src={p.avatar} online={p.online} />
              <span className="flex-1 text-sm font-semibold text-zinc-900 dark:text-white truncate">{p.name}</span>
              <Star className="w-4 h-4 text-amber-500" />
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
