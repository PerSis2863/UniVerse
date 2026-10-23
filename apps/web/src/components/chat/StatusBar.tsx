'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Check, Eye, ImagePlus, Loader2, Plus, Search, Send, Star, Trash2, Type, Users, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { useLiveInterval } from '@/lib/realtime-client';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { uploadChatFile } from './chat-client';
import { formatDistanceToNowStrict } from 'date-fns';
import { useAuthStore } from '@/store/auth';
import { photoSrcSet } from '@/lib/image-sizes';

// Status updates ("stories"), like WhatsApp's (src/server/chat-status.ts): a row of rings at the
// top of Chats. Tap one to watch; your own shows who has seen it. Gone after 24 hours. Stage 5 ·
// B7.9: react with an emoji or reply (a private message to them), and share with close friends only.

interface Item { id: string; kind: 'TEXT' | 'IMAGE'; body: string; mediaUrl: string | null; background: string | null; createdAt: string; seen: boolean; audience?: 'ALL' | 'CLOSE'; myReaction?: string | null; viewers?: { id: string; name: string; avatar: string | null; viewedAt: string; reaction: string | null }[] }
const REACTIONS = ['❤️', '😂', '😮', '😢', '👏', '🔥'];
/** A first name, skipping titles like "Dr.". */
const firstName = (name: string) => name.split(' ').find((w) => w && !w.endsWith('.')) ?? name;
interface Person { user: { id: string; name: string; avatar: string | null }; mine: boolean; items: Item[]; unseen: number }

const COLORS = ['#253745', '#484652', '#6b5560', '#e11d48', '#ea580c', '#059669', '#0891b2', '#11212d'];
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
              <span className="block rounded-full bg-white dark:bg-[#11212d] p-[2px]"><Avatar name={me?.name ?? "You"} src={me?.avatar ?? null} size={48} /></span>
            </span>
            <span onClick={(e) => { e.stopPropagation(); setComposing(true); }} className="absolute -bottom-0.5 -end-0.5 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center ring-2 ring-white dark:ring-[#11212d]"><Plus className="w-3 h-3" /></span>
          </button>
          <span className="text-[11px] text-zinc-500 truncate w-full text-center">{mine ? 'You' : 'Add'}</span>
        </div>
        {others.map((p) => (
          <div key={p.user.id} role="listitem" className="shrink-0 flex flex-col items-center gap-1 w-14">
            <button type="button" onClick={() => setWatching(people.indexOf(p))} aria-label={`${p.user.name}'s status${p.unseen ? ', new' : ''}`}>
              <span className={cn('block rounded-full p-[2px]', p.unseen ? 'bg-gradient-to-tr from-indigo-400 to-indigo-600' : 'bg-zinc-300 dark:bg-zinc-600')}>
                <span className="block rounded-full bg-white dark:bg-[#11212d] p-[2px]"><Avatar name={p.user.name} src={p.user.avatar} size={48} /></span>
              </span>
            </button>
            <span className={cn('text-[11px] truncate w-full text-center', p.unseen ? 'text-zinc-800 dark:text-zinc-200 font-medium' : 'text-zinc-500')}>{p.user.name.split(' ')[0]}</span>
          </div>
        ))}
        {data && others.length === 0 && <p className="self-center text-xs text-zinc-500 ps-1">Status updates from people you chat with show here for 24 hours.</p>}
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
  const [reply, setReply] = useState('');
  const [typing, setTyping] = useState(false);
  const [reacted, setReacted] = useState<Record<string, string | null>>({});
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
    const onKey = (e: KeyboardEvent) => { if (typing) return; if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!item) return null;
  const mine = item.id in reacted ? reacted[item.id] : item.myReaction ?? null;
  const react = async (emoji: string) => {
    const next = mine === emoji ? null : emoji;
    setReacted((r) => ({ ...r, [item.id]: next }));
    try { await authedJson(`/api/chat/status/${item.id}`, { method: 'POST', body: JSON.stringify({ reaction: next }) }); }
    catch (e) { setReacted((r) => ({ ...r, [item.id]: mine })); toast.error((e as Error).message); }
  };
  const sendReply = async () => {
    const text = reply.trim();
    if (!text) return;
    try {
      // A private message to them, quoting the status.
      const chat = await authedJson<{ id: string }>('/api/chat/conversations', { method: 'POST', body: JSON.stringify({ userId: person.user.id }) });
      const quote = item.kind === 'IMAGE' ? `📷 ${item.body || 'Photo'}` : item.body;
      await authedJson(`/api/chat/conversations/${chat.id}/messages`, { method: 'POST', body: JSON.stringify({ body: `↩️ Replying to your status: “${quote.slice(0, 80)}${quote.length > 80 ? '…' : ''}”\n\n${text}` }) });
      setReply('');
      setTyping(false);
      toast.success(`Sent to ${firstName(person.user.name)}`);
    } catch (e) { toast.error((e as Error).message || 'Couldn’t send it.'); }
  };
  const remove = async () => {
    try { await authedJson(`/api/chat/status/${item.id}`, { method: 'DELETE' }); toast.success('Status removed'); onDeleted(); onClose(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[150] bg-black flex items-center justify-center" role="dialog" aria-modal="true" aria-label={`${person.user.name}'s status`}>
      <div className="relative w-full h-full sm:max-w-md sm:h-[92vh] sm:rounded-3xl overflow-hidden" onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerLeave={() => setPaused(false)}>
        {item.kind === 'IMAGE' && item.mediaUrl
          ? <img src={item.mediaUrl} {...photoSrcSet(item.mediaUrl, '100vw')} alt="" className="absolute inset-0 w-full h-full object-contain bg-black" />
          : <div className="absolute inset-0 flex items-center justify-center p-8" style={{ background: item.background ?? COLORS[0] }}><p className="text-white text-2xl sm:text-3xl font-bold text-center leading-snug break-words whitespace-pre-wrap">{item.body}</p></div>}
        {item.kind === 'IMAGE' && item.body && <p className="absolute bottom-20 inset-x-0 px-6 text-center text-white text-base drop-shadow-lg">{item.body}</p>}
        {/* Progress, who, close */}
        <div className="absolute top-0 inset-x-0 p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] bg-gradient-to-b from-black/60 to-transparent">
          {/* The current bar fills over 5 seconds (a CSS animation, paused while held), then moves on. */}
          <div className="flex gap-1 mb-3">{person.items.map((it, i) => (
            <span key={it.id} className="h-0.5 flex-1 rounded-full bg-white/30 overflow-hidden">
              {i === idx
                ? <span key={`${who}-${idx}`} className="block h-full bg-white status-progress" style={{ animationDuration: `${SHOW_MS}ms`, animationPlayState: paused || showViewers || typing ? 'paused' : 'running' }} onAnimationEnd={next} />
                : <span className="block h-full bg-white" style={{ width: i < idx ? '100%' : '0%' }} />}
            </span>
          ))}</div>
          <div className="flex items-center gap-2 text-white">
            <Avatar name={person.user.name} src={person.user.avatar} size={36} />
            <div className="flex-1 min-w-0"><p className="font-semibold text-sm truncate">{person.mine ? 'You' : person.user.name}</p><p className="text-[11px] text-white/70">{formatDistanceToNowStrict(new Date(item.createdAt), { addSuffix: true })}{item.audience === 'CLOSE' && <span className="ms-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-500/90 px-1.5 text-[10px] font-semibold text-white"><Star className="w-2.5 h-2.5 fill-current" aria-hidden />Close friends</span>}</p></div>
            {person.mine && <button type="button" onClick={remove} aria-label="Delete this status" className="p-2 rounded-full hover:bg-white/10"><Trash2 className="w-5 h-5" /></button>}
            <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-white/10"><X className="w-5 h-5" /></button>
          </div>
        </div>
        {/* Tap left / right */}
        <button type="button" aria-label="Previous" onClick={prev} className="absolute start-0 top-20 bottom-24 w-1/3" />
        <button type="button" aria-label="Next" onClick={next} className="absolute end-0 top-20 bottom-24 w-2/3" />
        {!person.mine && (
          // React (one emoji, only they see it) or reply privately.
          <div className="absolute bottom-0 inset-x-0 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] bg-gradient-to-t from-black/70 to-transparent space-y-2" onPointerDown={(e) => e.stopPropagation()}>
            <div className="flex justify-center gap-1.5" role="group" aria-label="React">
              {REACTIONS.map((r) => (
                <motion.button key={r} whileTap={{ scale: 0.8 }} type="button" onClick={() => void react(r)} aria-pressed={mine === r} aria-label={`React ${r}`} className={cn('w-10 h-10 rounded-full text-xl grid place-items-center transition-colors', mine === r ? 'bg-white/40 ring-2 ring-white' : 'bg-white/10 hover:bg-white/20')}>{r}</motion.button>
              ))}
            </div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void sendReply(); }}>
              <input value={reply} onChange={(e) => setReply(e.target.value)} onFocus={() => setTyping(true)} onBlur={() => { if (!reply.trim()) setTyping(false); }} maxLength={1000} placeholder={`Reply to ${firstName(person.user.name)}…`} aria-label="Reply privately"
                className="flex-1 min-w-0 rounded-full bg-white/15 backdrop-blur border border-white/20 px-4 py-2.5 text-sm text-white placeholder:text-white/60 outline-none focus:border-white/50" />
              <button type="submit" disabled={!reply.trim()} aria-label="Send reply" className="w-11 h-11 rounded-full bg-white text-indigo-600 grid place-items-center disabled:opacity-50"><Send className="w-4 h-4" /></button>
            </form>
          </div>
        )}
        {person.mine && (
          <div className="absolute bottom-0 inset-x-0 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] flex justify-center">
            <button type="button" onClick={() => setShowViewers(!showViewers)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/15 backdrop-blur text-white text-sm font-semibold"><Eye className="w-4 h-4" /> {item.viewers?.length ?? 0} viewed{item.viewers?.some((v) => v.reaction) ? ` · ${item.viewers.filter((v) => v.reaction).map((v) => v.reaction).slice(0, 4).join('')}` : ''}</button>
          </div>
        )}
        <AnimatePresence>
          {showViewers && (
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={spring.smooth} className="absolute bottom-0 inset-x-0 max-h-[55%] overflow-y-auto rounded-t-3xl bg-white dark:bg-[#11212d] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <div className="flex items-center justify-between mb-2"><p className="font-semibold text-zinc-900 dark:text-white">Viewed by</p><button type="button" onClick={() => setShowViewers(false)} aria-label="Close" className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button></div>
              {!item.viewers?.length ? <p className="text-sm text-zinc-500 py-4">Nobody yet.</p> : item.viewers.map((v) => (
                <div key={v.id} className="flex items-center gap-3 py-2"><Avatar name={v.name} src={v.avatar} size={36} /><span className="flex-1 text-sm text-zinc-900 dark:text-white">{v.name}</span>{v.reaction && <span className="text-lg" aria-label={`reacted ${v.reaction}`}>{v.reaction}</span>}<span className="text-xs text-zinc-500">{formatDistanceToNowStrict(new Date(v.viewedAt), { addSuffix: true })}</span></div>
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
  const [audience, setAudience] = useState<'ALL' | 'CLOSE'>('ALL');
  const [picking, setPicking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.preview); }, [photo]);

  const post = async () => {
    setBusy(true);
    try {
      let mediaUrl: string | undefined;
      if (photo) mediaUrl = await uploadChatFile(photo.file);
      await authedJson('/api/chat/status', { method: 'POST', body: JSON.stringify(photo ? { kind: 'IMAGE', mediaUrl, body: text, audience } : { kind: 'TEXT', body: text, background: color, audience }) });
      toast.success(audience === 'CLOSE' ? 'Shared with your close friends for 24 hours' : 'Status shared for 24 hours');
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
        {/* Who sees it: everyone you chat with, or your close friends. */}
        <div className="flex items-center justify-center gap-1.5 px-4" role="group" aria-label="Who sees it">
          <button type="button" onClick={() => setAudience('ALL')} aria-pressed={audience === 'ALL'} className={cn('inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold', audience === 'ALL' ? 'bg-white text-zinc-900' : 'bg-white/15 text-white')}><Users className="w-3.5 h-3.5" aria-hidden />Everyone</button>
          <button type="button" onClick={() => setAudience('CLOSE')} aria-pressed={audience === 'CLOSE'} className={cn('inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold', audience === 'CLOSE' ? 'bg-emerald-500 text-white' : 'bg-white/15 text-white')}><Star className="w-3.5 h-3.5" aria-hidden />Close friends</button>
          <button type="button" onClick={() => setPicking(true)} className="px-2 py-1.5 text-xs font-semibold text-white/80 underline underline-offset-2">Edit list</button>
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
        {picking && <CloseFriends onClose={() => setPicking(false)} />}
      </motion.div>
    </motion.div>
  );
}

/** Choosing close friends from the people you chat with. */
function CloseFriends({ onClose }: { onClose: () => void }) {
  const { data, mutate } = useSWR<{ ids: string[]; people: { id: string; name: string; avatar: string | null }[] }>('/api/chat/status/close-friends', authedJson);
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const picked = chosen ?? new Set(data?.ids ?? []);
  const shown = (data?.people ?? []).filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id: string) => { const s = new Set(picked); if (s.has(id)) s.delete(id); else s.add(id); setChosen(s); };
  const save = async () => {
    setBusy(true);
    try { await authedJson('/api/chat/status/close-friends', { method: 'PUT', body: JSON.stringify({ ids: [...picked] }) }); await mutate(); toast.success(`${picked.size} close friend${picked.size === 1 ? '' : 's'}`); onClose(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="absolute inset-0 z-10 bg-black/60 flex items-end sm:items-center justify-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="close-title" className="w-full sm:max-w-sm max-h-[80%] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#11212d] text-zinc-900 dark:text-white">
        <div className="flex items-center justify-between p-4 pb-2"><h2 id="close-title" className="font-bold">Close friends</h2><button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button></div>
        <p className="px-4 text-xs text-zinc-500">Only they see statuses you share with close friends. They aren’t told they’re on the list.</p>
        <div className="relative px-4 pt-3"><Search className="absolute start-7 top-1/2 mt-1.5 -translate-y-1/2 w-4 h-4 text-zinc-400" aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search people" className="input ps-9" /></div>
        <ul className="flex-1 overflow-y-auto px-2 py-2">
          {!data && <li className="py-6 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" aria-label="Loading" /></li>}
          {data && !shown.length && <li className="px-2 py-6 text-sm text-zinc-500 text-center">{data.people.length ? 'Nobody matches.' : 'Your close friends come from the people you chat with.'}</li>}
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" role="checkbox" aria-checked={picked.has(p.id)} onClick={() => toggle(p.id)} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/5 text-start">
                <Avatar name={p.name} src={p.avatar} size={34} />
                <span className="flex-1 text-sm truncate">{p.name}</span>
                <span className={cn('w-5 h-5 rounded-full border grid place-items-center', picked.has(p.id) ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-zinc-300 dark:border-white/20')}>{picked.has(p.id) && <Check className="w-3 h-3" aria-hidden />}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="p-4 pt-2 border-t border-zinc-100 dark:border-white/[0.06]"><button type="button" onClick={() => void save()} disabled={busy || !data} className="btn-primary w-full">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Save · {picked.size}</button></div>
      </div>
    </div>
  );
}
