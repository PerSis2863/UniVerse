'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Eye, ImagePlus, Loader2, Plus, Send, Trash2, Type, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { useLiveInterval } from '@/lib/realtime-client';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { uploadChatFile } from './chat-client';
import { formatDistanceToNowStrict } from 'date-fns';
import { useAuthStore } from '@/store/auth';

// Status updates ("stories"), like WhatsApp's (src/server/chat-status.ts): a row of rings at the
// top of Chats. Tap one to watch; your own shows who has seen it. Gone after 24 hours.

interface Item { id: string; kind: 'TEXT' | 'IMAGE'; body: string; mediaUrl: string | null; background: string | null; createdAt: string; seen: boolean; viewers?: { id: string; name: string; avatar: string | null; viewedAt: string }[] }
interface Person { user: { id: string; name: string; avatar: string | null }; mine: boolean; items: Item[]; unseen: number }

const COLORS = ['#4f46e5', '#7c3aed', '#db2777', '#e11d48', '#ea580c', '#059669', '#0891b2', '#18181b'];
const SHOW_MS = 5000;

export function StatusBar() {
  // Live updates refresh it when someone posts; poll slowly only without them.
  const poll = useLiveInterval(5 * 60_000, 0);
  const { data, mutate } = useSWR<Person[]>('/api/chat/status', authedJson, { refreshInterval: poll, revalidateOnFocus: false });
  const [watching, setWatching] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const me = useAuthStore((st) => st.user);
  const people = data ?? [];
  const mine = people.find((p) => p.mine);
  const others = people.filter((p) => !p.mine);

  return (
    <>
      <div className="flex gap-3 overflow-x-auto scrollbar-none px-4 py-3 border-b border-zinc-200/80 dark:border-white/[0.06]" role="list" aria-label="Status updates">
        <div role="listitem" className="shrink-0 flex flex-col items-center gap-1 w-14">
          <button type="button" onClick={() => (mine ? setWatching(people.indexOf(mine)) : setComposing(true))} aria-label={mine ? 'Your status' : 'Add a status'} className="relative">
            <span className={cn('block rounded-full p-[2px]', mine ? 'bg-zinc-300 dark:bg-zinc-600' : '')}>
              <span className="block rounded-full bg-white dark:bg-[#121830] p-[2px]"><Avatar name={me?.name ?? "You"} src={me?.avatar ?? null} size={48} /></span>
            </span>
            <span onClick={(e) => { e.stopPropagation(); setComposing(true); }} className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center ring-2 ring-white dark:ring-[#121830]"><Plus className="w-3 h-3" /></span>
          </button>
          <span className="text-[11px] text-zinc-500 truncate w-full text-center">{mine ? 'You' : 'Add'}</span>
        </div>
        {others.map((p) => (
          <div key={p.user.id} role="listitem" className="shrink-0 flex flex-col items-center gap-1 w-14">
            <button type="button" onClick={() => setWatching(people.indexOf(p))} aria-label={`${p.user.name}'s status${p.unseen ? ', new' : ''}`}>
              <span className={cn('block rounded-full p-[2px]', p.unseen ? 'bg-gradient-to-tr from-emerald-400 via-indigo-500 to-fuchsia-500' : 'bg-zinc-300 dark:bg-zinc-600')}>
                <span className="block rounded-full bg-white dark:bg-[#121830] p-[2px]"><Avatar name={p.user.name} src={p.user.avatar} size={48} /></span>
              </span>
            </button>
            <span className={cn('text-[11px] truncate w-full text-center', p.unseen ? 'text-zinc-800 dark:text-zinc-200 font-medium' : 'text-zinc-500')}>{p.user.name.split(' ')[0]}</span>
          </div>
        ))}
        {data && others.length === 0 && <p className="self-center text-xs text-zinc-500 pl-1">Status updates from people you chat with show here for 24 hours.</p>}
      </div>
      <AnimatePresence>
        {watching !== null && people[watching] && (
          <StatusViewer key="viewer" people={people} start={watching} onClose={() => { setWatching(null); void mutate(); }} onDeleted={() => void mutate()} />
        )}
        {composing && <StatusComposer key="composer" onClose={() => setComposing(false)} onPosted={() => { setComposing(false); void mutate(); }} />}
      </AnimatePresence>
    </>
  );
}

function StatusViewer({ people, start, onClose, onDeleted }: { people: Person[]; start: number; onClose: () => void; onDeleted: () => void }) {
  const [who, setWho] = useState(start);
  const person = people[who];
  // Start at their first unseen update.
  const firstUnseen = (p: Person) => Math.max(0, p.items.findIndex((i) => !i.seen));
  const [idx, setIdx] = useState(() => firstUnseen(people[start]));
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const item = person?.items[idx];
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!item || person.mine || seen.current.has(item.id)) return;
    seen.current.add(item.id);
    void authedJson(`/api/chat/status/${item.id}`, { method: 'POST' }).catch(() => {});
  }, [item, person]);

  const next = () => {
    if (idx < person.items.length - 1) { setIdx(idx + 1); return; }
    if (who < people.length - 1) { setWho(who + 1); setIdx(firstUnseen(people[who + 1])); return; }
    onClose();
  };
  const prev = () => {
    if (idx > 0) { setIdx(idx - 1); return; }
    if (who > 0) { setWho(who - 1); setIdx(0); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!item) return null;
  const remove = async () => {
    try { await authedJson(`/api/chat/status/${item.id}`, { method: 'DELETE' }); toast.success('Status removed'); onDeleted(); onClose(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[150] bg-black flex items-center justify-center" role="dialog" aria-modal="true" aria-label={`${person.user.name}'s status`}>
      <div className="relative w-full h-full sm:max-w-md sm:h-[92vh] sm:rounded-3xl overflow-hidden" onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerLeave={() => setPaused(false)}>
        {item.kind === 'IMAGE' && item.mediaUrl
          ? <img src={item.mediaUrl} alt="" className="absolute inset-0 w-full h-full object-contain bg-black" />
          : <div className="absolute inset-0 flex items-center justify-center p-8" style={{ background: item.background ?? COLORS[0] }}><p className="text-white text-2xl sm:text-3xl font-bold text-center leading-snug break-words whitespace-pre-wrap">{item.body}</p></div>}
        {item.kind === 'IMAGE' && item.body && <p className="absolute bottom-20 inset-x-0 px-6 text-center text-white text-base drop-shadow-lg">{item.body}</p>}
        {/* Progress, who, close */}
        <div className="absolute top-0 inset-x-0 p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] bg-gradient-to-b from-black/60 to-transparent">
          {/* The current bar fills over 5 seconds (a CSS animation, paused while held), then moves on. */}
          <div className="flex gap-1 mb-3">{person.items.map((it, i) => (
            <span key={it.id} className="h-0.5 flex-1 rounded-full bg-white/30 overflow-hidden">
              {i === idx
                ? <span key={`${who}-${idx}`} className="block h-full bg-white status-progress" style={{ animationDuration: `${SHOW_MS}ms`, animationPlayState: paused || showViewers ? 'paused' : 'running' }} onAnimationEnd={next} />
                : <span className="block h-full bg-white" style={{ width: i < idx ? '100%' : '0%' }} />}
            </span>
          ))}</div>
          <div className="flex items-center gap-2 text-white">
            <Avatar name={person.user.name} src={person.user.avatar} size={36} />
            <div className="flex-1 min-w-0"><p className="font-semibold text-sm truncate">{person.mine ? 'You' : person.user.name}</p><p className="text-[11px] text-white/70">{formatDistanceToNowStrict(new Date(item.createdAt), { addSuffix: true })}</p></div>
            {person.mine && <button type="button" onClick={remove} aria-label="Delete this status" className="p-2 rounded-full hover:bg-white/10"><Trash2 className="w-5 h-5" /></button>}
            <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-white/10"><X className="w-5 h-5" /></button>
          </div>
        </div>
        {/* Tap left / right */}
        <button type="button" aria-label="Previous" onClick={prev} className="absolute left-0 top-20 bottom-24 w-1/3" />
        <button type="button" aria-label="Next" onClick={next} className="absolute right-0 top-20 bottom-24 w-2/3" />
        {person.mine && (
          <div className="absolute bottom-0 inset-x-0 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] flex justify-center">
            <button type="button" onClick={() => setShowViewers(!showViewers)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/15 backdrop-blur text-white text-sm font-semibold"><Eye className="w-4 h-4" /> {item.viewers?.length ?? 0} viewed</button>
          </div>
        )}
        <AnimatePresence>
          {showViewers && (
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={spring.smooth} className="absolute bottom-0 inset-x-0 max-h-[55%] overflow-y-auto rounded-t-3xl bg-white dark:bg-[#121830] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <div className="flex items-center justify-between mb-2"><p className="font-semibold text-zinc-900 dark:text-white">Viewed by</p><button type="button" onClick={() => setShowViewers(false)} aria-label="Close" className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button></div>
              {!item.viewers?.length ? <p className="text-sm text-zinc-500 py-4">Nobody yet.</p> : item.viewers.map((v) => (
                <div key={v.id} className="flex items-center gap-3 py-2"><Avatar name={v.name} src={v.avatar} size={36} /><span className="flex-1 text-sm text-zinc-900 dark:text-white">{v.name}</span><span className="text-xs text-zinc-500">{formatDistanceToNowStrict(new Date(v.viewedAt), { addSuffix: true })}</span></div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function StatusComposer({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const [text, setText] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.preview); }, [photo]);

  const post = async () => {
    setBusy(true);
    try {
      let mediaUrl: string | undefined;
      if (photo) mediaUrl = await uploadChatFile(photo.file);
      await authedJson('/api/chat/status', { method: 'POST', body: JSON.stringify(photo ? { kind: 'IMAGE', mediaUrl, body: text } : { kind: 'TEXT', body: text, background: color }) });
      toast.success('Status shared for 24 hours');
      onPosted();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-label="New status">
      <motion.div initial={{ scale: 0.96, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 20 }} transition={spring.smooth} className="relative w-full h-full sm:max-w-md sm:h-[85vh] sm:rounded-3xl overflow-hidden flex flex-col" style={{ background: photo ? '#000' : color }}>
        <div className="flex items-center justify-between p-4 pt-[calc(env(safe-area-inset-top)+1rem)] text-white">
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-white/15"><X className="w-5 h-5" /></button>
          <div className="flex gap-1">
            <button type="button" onClick={() => { setPhoto(null); }} aria-label="Text status" className={cn('p-2 rounded-full', !photo ? 'bg-white/25' : 'hover:bg-white/15')}><Type className="w-5 h-5" /></button>
            <button type="button" onClick={() => fileRef.current?.click()} aria-label="Photo status" className={cn('p-2 rounded-full', photo ? 'bg-white/25' : 'hover:bg-white/15')}><ImagePlus className="w-5 h-5" /></button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhoto({ file: f, preview: URL.createObjectURL(f) }); e.target.value = ''; }} />
          </div>
        </div>
        <div className="flex-1 relative flex items-center justify-center px-6">
          {photo ? <img src={photo.preview} alt="" className="absolute inset-0 w-full h-full object-contain" /> : null}
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={700} rows={photo ? 2 : 5} autoFocus={!photo} placeholder={photo ? 'Add a caption…' : 'Type a status'}
            className={cn('relative w-full bg-transparent text-white placeholder:text-white/60 outline-none resize-none text-center', photo ? 'self-end mb-6 text-base bg-black/40 rounded-2xl p-3' : 'text-2xl sm:text-3xl font-bold')} />
        </div>
        <div className="flex items-center gap-2 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {!photo && <div className="flex gap-1.5 flex-1 overflow-x-auto scrollbar-none">{COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label="Background colour" className={cn('w-7 h-7 rounded-full shrink-0 ring-2', color === c ? 'ring-white' : 'ring-white/30')} style={{ background: c }} />
          ))}</div>}
          {photo && <div className="flex-1" />}
          <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={() => void post()} disabled={busy || (!photo && !text.trim())} aria-label="Share status" className="w-12 h-12 rounded-full bg-white text-indigo-600 flex items-center justify-center shadow-lg disabled:opacity-50">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
