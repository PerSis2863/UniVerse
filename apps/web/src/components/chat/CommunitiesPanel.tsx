'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Compass, Crown, Globe2, Hash, Headphones, Link2, Loader2, LogOut, Megaphone, Plus, Search, Settings2, Shield, Trash2, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { confirmDialog } from '@/components/ui/Dialogs';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Avatar } from './MessageBubble';
import { chatJson } from './chat-client';
import { Switch } from '@/components/ui/Switch';
import { useActivePoll } from '@/lib/realtime-client';
import { TabPill } from '@/components/ui/Glide';

// Communities (Discord server / WhatsApp community), src/server/communities.ts: a list of
// communities, each opening to its channels. Text channels open in the chat on the right; voice
// channels are drop-in calls. Moderators manage members, roles, channels and the invite link, and
// can open a community to everyone (Discover, which includes partner campuses in a campus network).

type Kind = 'TEXT' | 'ANNOUNCE' | 'VOICE';
interface Channel { id: string; name: string; kind: Kind; slowModeSec: number; unread: number }
interface Community { id: string; name: string; description: string | null; color: string; members: number; role: 'OWNER' | 'MOD' | 'MEMBER'; channels: Channel[] }
const COLORS = ['#4f46e5', '#7c3aed', '#db2777', '#e11d48', '#ea580c', '#059669', '#0891b2', '#334155'];
const input = 'w-full px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40';

export function CommunitiesPanel({ activeId, onOpen }: { activeId: string | null; onOpen: (channelId: string) => void }) {
  const { data, isLoading, mutate } = useSWR<Community[]>('/api/chat/communities', authedJson, { revalidateOnFocus: true });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [managing, setManaging] = useState<Community | null>(null);
  const list = data ?? [];
  const isOpen = (c: Community) => open[c.id] ?? list.length <= 3;

  return (
    <div className="p-2">
      <div className="flex items-center justify-between px-2 py-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Your communities</p>
        <div className="flex gap-1">
          <button type="button" onClick={() => setJoining(true)} className="px-2.5 py-1.5 rounded-full text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 inline-flex items-center gap-1"><Link2 className="w-3.5 h-3.5" /> Join</button>
          <button type="button" onClick={() => setCreating(true)} className="px-2.5 py-1.5 rounded-full text-xs font-semibold bg-indigo-600 text-white inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> New</button>
        </div>
      </div>
      {isLoading && <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /></div>}
      {data && list.length === 0 && (
        <div className="p-6 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center mb-3"><Users className="w-7 h-7 text-white" /></div>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">No communities yet</p>
          <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">A community keeps a class, club or department together: channels for each topic, announcements, and a voice room anyone can drop into.</p>
          <button type="button" onClick={() => setCreating(true)} className="mt-3 text-sm font-semibold text-indigo-500">Create one</button>
        </div>
      )}
      {list.map((c) => {
        const unread = c.channels.reduce((n, ch) => n + ch.unread, 0);
        return (
          <div key={c.id} className="mb-1">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setOpen((o) => ({ ...o, [c.id]: !isOpen(c) }))} aria-expanded={isOpen(c)} className="flex-1 min-w-0 flex items-center gap-3 p-2.5 rounded-2xl text-left hover:bg-zinc-100/80 dark:hover:bg-white/[0.04]">
                <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-lg shrink-0" style={{ background: c.color }}>{c.name.slice(0, 1).toUpperCase()}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-zinc-900 dark:text-white truncate">{c.name}</span>
                  <span className="block text-xs text-zinc-500">{c.members} member{c.members === 1 ? '' : 's'}{c.role !== 'MEMBER' ? ` · ${c.role === 'OWNER' ? 'owner' : 'moderator'}` : ''}</span>
                </span>
                {unread > 0 && !isOpen(c) && <span className="min-w-5 h-5 px-1.5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">{unread > 99 ? '99+' : unread}</span>}
                <ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform', isOpen(c) && 'rotate-180')} />
              </button>
              <button type="button" onClick={() => setManaging(c)} aria-label={`${c.name} settings`} className="p-2 rounded-full text-zinc-400 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/10"><Settings2 className="w-4 h-4" /></button>
            </div>
            <AnimatePresence initial={false}>
              {isOpen(c) && (
                <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.smooth} className="overflow-hidden ml-6 pl-3 border-l border-zinc-200 dark:border-white/10">
                  {c.channels.map((ch) => <ChannelRow key={ch.id} ch={ch} active={activeId === ch.id} onOpen={() => onOpen(ch.id)} />)}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        );
      })}
      {data && (
        <button type="button" onClick={() => setDiscovering(true)} className="w-full mt-1 flex items-center gap-3 p-2.5 rounded-2xl text-left hover:bg-zinc-100/80 dark:hover:bg-white/[0.04]">
          <span className="w-11 h-11 rounded-2xl flex items-center justify-center bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 shrink-0"><Compass className="w-5 h-5" /></span>
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-zinc-900 dark:text-white">Discover communities</span>
            <span className="block text-xs text-zinc-500">Open communities, including partner campuses</span>
          </span>
          <ChevronRight className="w-4 h-4 text-zinc-400" />
        </button>
      )}
      <AnimatePresence>
        {discovering && <DiscoverCommunities key="discover" onClose={() => setDiscovering(false)} onJoined={() => void mutate()} />}
        {creating && <CreateCommunity key="create" onClose={() => setCreating(false)} onDone={() => { setCreating(false); void mutate(); }} />}
        {joining && <JoinCommunity key="join" onClose={() => setJoining(false)} onDone={() => { setJoining(false); void mutate(); }} />}
        {managing && <ManageCommunity key="manage" community={managing} onClose={() => { setManaging(null); void mutate(); }} />}
      </AnimatePresence>
    </div>
  );
}

function ChannelRow({ ch, active, onOpen }: { ch: Channel; active: boolean; onOpen: () => void }) {
  const router = useRouter();
  // Voice rooms show who's inside (one small request when the list opens).
  const { data: peers } = useSWR<{ count: number; names: string[] }>(ch.kind === 'VOICE' ? `/api/calls/r_${ch.id}/peers` : null, authedJson, { revalidateOnFocus: false, refreshInterval: useActivePoll(60_000) });
  if (ch.kind === 'VOICE') {
    return (
      <li>
        <button type="button" onClick={() => router.push(`/call/r_${ch.id}?kind=audio`)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left hover:bg-emerald-500/10 group">
          <Headphones className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm text-zinc-700 dark:text-zinc-200 truncate">{ch.name}</span>
            {!!peers?.count && <span className="block text-[11px] text-emerald-600 dark:text-emerald-400 truncate">{peers.names.slice(0, 3).map((n) => n.split(' ')[0]).join(', ')}{peers.count > 3 ? ` +${peers.count - 3}` : ''} inside</span>}
          </span>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 opacity-0 group-hover:opacity-100">Join</span>
        </button>
      </li>
    );
  }
  return (
    <li>
      <button type="button" onClick={onOpen} className={cn('relative isolate w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-colors', active ? 'text-indigo-700 dark:text-indigo-200' : 'hover:bg-zinc-100/80 dark:hover:bg-white/[0.04]')}>{active && <TabPill id="onents-chat-communitiespanel-0" variant="soft" />}
        {ch.kind === 'ANNOUNCE' ? <Megaphone className="w-4 h-4 text-amber-500 shrink-0" /> : <Hash className="w-4 h-4 text-zinc-400 shrink-0" />}
        <span className={cn('flex-1 text-sm truncate', ch.unread ? 'font-semibold text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-300')}>{ch.name}</span>
        {ch.unread > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">{ch.unread > 99 ? '99+' : ch.unread}</span>}
      </button>
    </li>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div data-sheet initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={spring.smooth} role="dialog" aria-modal="true" aria-label={title}
        className="w-full sm:max-w-md max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 shadow-2xl">
        <div className="p-5 pb-3 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-zinc-900 dark:text-white truncate">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4 sheet-safe-bottom">{children}</div>
      </motion.div>
    </motion.div>
  );
}

function CreateCommunity({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      await chatJson('/api/chat/communities', { method: 'POST', body: JSON.stringify({ name, description, color }) });
      toast.success(`"${name.trim()}" created with #general, #announcements and a Study room. Add members from its settings.`);
      onDone();
    } catch (e) { toast.error((e as Error).message); setBusy(false); }
  };
  return (
    <Sheet title="New community" onClose={onClose}>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Name (e.g. CS Department, Chess Club)" className={input} />
      <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="What it's for (optional)" className={input} />
      <div className="flex gap-2" role="radiogroup" aria-label="Colour">{COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={color === c} onClick={() => setColor(c)} className={cn('w-8 h-8 rounded-xl ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#121830]', color === c ? 'ring-indigo-500' : 'ring-transparent')} style={{ background: c }} />
      ))}</div>
      <p className="text-xs text-zinc-500">It starts with #general, #announcements (only moderators post) and a Study room voice channel.</p>
      <button type="button" onClick={() => void create()} disabled={busy || !name.trim()} className="btn-primary w-full py-3">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create community</button>
    </Sheet>
  );
}

function JoinCommunity({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const join = async () => {
    const code = link.trim().match(/join=([A-Za-z0-9_-]+)/)?.[1] ?? link.trim();
    setBusy(true);
    try {
      const c = await chatJson<{ name: string }>('/api/chat/communities/join', { method: 'POST', body: JSON.stringify({ code }) });
      toast.success(`You joined ${c.name}`);
      onDone();
    } catch (e) { toast.error((e as Error).message); setBusy(false); }
  };
  return (
    <Sheet title="Join a community" onClose={onClose}>
      <input autoFocus value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste the invite link or code" className={input} />
      <button type="button" onClick={() => void join()} disabled={busy || !link.trim()} className="btn-primary w-full py-3">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} Join</button>
    </Sheet>
  );
}

interface Open { id: string; name: string; description: string | null; color: string; members: number; campus: string | null }

/** Communities open to everyone (moderators turned on "Anyone can find and join") that I'm not in yet. */
function DiscoverCommunities({ onClose, onJoined }: { onClose: () => void; onJoined: () => void }) {
  const { data, mutate, isLoading } = useSWR<Open[]>('/api/chat/communities/discover', authedJson, { revalidateOnFocus: false });
  const [busy, setBusy] = useState<string | null>(null);
  const join = async (c: Open) => {
    setBusy(c.id);
    try {
      await chatJson('/api/chat/communities/join', { method: 'POST', body: JSON.stringify({ communityId: c.id }) });
      toast.success(`You joined ${c.name}`);
      await mutate((list) => list?.filter((x) => x.id !== c.id), { revalidate: false });
      onJoined();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <Sheet title="Discover communities" onClose={onClose}>
      {isLoading ? <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /></div>
        : !data?.length ? <p className="text-sm text-zinc-500 py-4 text-center">No open communities right now. Moderators can open theirs in the community’s settings.</p>
        : (
          <ul className="space-y-1">
            {data.map((c) => (
              <li key={c.id} className="flex items-center gap-3 p-2 rounded-2xl hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black shrink-0" style={{ background: c.color }}>{c.name.slice(0, 1).toUpperCase()}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-sm text-zinc-900 dark:text-white truncate">{c.name}</span>
                  <span className="block text-xs text-zinc-500 truncate">{c.members} member{c.members === 1 ? '' : 's'}{c.campus ? ` · ${c.campus}` : ''}{c.description ? ` · ${c.description}` : ''}</span>
                </span>
                <button type="button" onClick={() => void join(c)} disabled={busy === c.id} className="btn-primary btn-sm shrink-0">{busy === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Join'}</button>
              </li>
            ))}
          </ul>
        )}
    </Sheet>
  );
}

interface Detail { id: string; name: string; description: string | null; color: string; inviteCode: string | null; discoverable: boolean; myRole: 'OWNER' | 'MOD' | 'MEMBER'; members: { id: string; name: string; avatar: string | null; communityRole: string }[] }

function ManageCommunity({ community, onClose }: { community: Community; onClose: () => void }) {
  const { data, mutate } = useSWR<Detail>(`/api/chat/communities/${community.id}`, authedJson);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { data: people } = useSWR<{ id: string; name: string; avatar: string | null }[]>(adding ? `/api/chat/users?q=${encodeURIComponent(debounced)}` : null, authedJson);
  const [channelName, setChannelName] = useState('');
  const [channelKind, setChannelKind] = useState<Kind>('TEXT');
  const mod = data?.myRole === 'OWNER' || data?.myRole === 'MOD';
  const owner = data?.myRole === 'OWNER';
  const post = async (body: Record<string, unknown>, ok?: string) => {
    try { await chatJson(`/api/chat/communities/${community.id}`, { method: 'POST', body: JSON.stringify(body) }); if (ok) toast.success(ok); await mutate(); return true; }
    catch (e) { toast.error((e as Error).message); return false; }
  };
  const invite = data?.inviteCode ? `${window.location.origin}${window.location.pathname}?join=${data.inviteCode}` : null;

  return (
    <Sheet title={community.name} onClose={onClose}>
      {!data ? <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /></div> : (
        <>
          {invite && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-zinc-500">Invite link</p>
              <div className="flex gap-2">
                <input readOnly value={invite} className={cn(input, 'text-xs')} onFocus={(e) => e.target.select()} />
                <button type="button" onClick={() => { void navigator.clipboard.writeText(invite).then(() => toast.success('Invite link copied')); }} className="btn-secondary shrink-0">Copy</button>
              </div>
              <button type="button" onClick={async () => { await chatJson(`/api/chat/communities/${community.id}`, { method: 'PATCH', body: JSON.stringify({ newInvite: true }) }); await mutate(); toast.success('New link made; the old one stopped working'); }} className="text-xs font-semibold text-indigo-500">Make a new link</button>
            </section>
          )}

          {mod && (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] p-3">
              <span className="flex items-start gap-2.5">
                <Globe2 className="w-4 h-4 mt-0.5 text-indigo-500 shrink-0" />
                <span>
                  <span className="block text-sm font-semibold text-zinc-900 dark:text-white">Anyone can find and join</span>
                  <span className="block text-xs text-zinc-500">Listed under Discover communities, also for partner campuses.</span>
                </span>
              </span>
              <Switch checked={data.discoverable} label="Anyone can find and join" onChange={async (on) => {
                try { await chatJson(`/api/chat/communities/${community.id}`, { method: 'PATCH', body: JSON.stringify({ discoverable: on }) }); await mutate(); toast.success(on ? 'Anyone can now find and join it' : 'Only people with the invite link can join now'); }
                catch (err) { toast.error((err as Error).message); }
              }} />
            </div>
          )}

          {mod && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-zinc-500">Channels</p>
              <ul className="space-y-1">{community.channels.map((ch) => (
                <li key={ch.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 bg-zinc-50 dark:bg-white/[0.03]">
                  {ch.kind === 'VOICE' ? <Headphones className="w-4 h-4 text-emerald-500" /> : ch.kind === 'ANNOUNCE' ? <Megaphone className="w-4 h-4 text-amber-500" /> : <Hash className="w-4 h-4 text-zinc-400" />}
                  <span className="flex-1 text-sm truncate text-zinc-800 dark:text-zinc-200">{ch.name}</span>
                  {ch.kind !== 'VOICE' && (
                    <select aria-label={`Slow mode for ${ch.name}`} defaultValue={ch.slowModeSec} onChange={async (e) => { try { await chatJson(`/api/chat/channels/${ch.id}`, { method: 'PATCH', body: JSON.stringify({ slowModeSec: Number(e.target.value) }) }); toast.success('Slow mode updated'); } catch (err) { toast.error((err as Error).message); } }} className="text-xs rounded-lg bg-white dark:bg-white/[0.06] border border-zinc-200 dark:border-white/10 px-1.5 py-1 text-zinc-700 dark:text-zinc-200">
                      <option value={0}>Slow mode off</option><option value={10}>10 s</option><option value={30}>30 s</option><option value={60}>1 min</option><option value={300}>5 min</option><option value={900}>15 min</option>
                    </select>
                  )}
                  <button type="button" aria-label={`Delete ${ch.name}`} onClick={async () => { if (!(await confirmDialog({ title: `Delete ${ch.name}?`, message: 'Its messages are deleted for everyone.', destructive: true }))) return; try { await chatJson(`/api/chat/channels/${ch.id}`, { method: 'PATCH', body: JSON.stringify({ delete: true }) }); toast.success('Channel deleted'); onClose(); } catch (err) { toast.error((err as Error).message); } }} className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </li>
              ))}</ul>
              <div className="flex gap-2">
                <input value={channelName} onChange={(e) => setChannelName(e.target.value)} maxLength={40} placeholder="New channel name" className={input} />
                <select value={channelKind} onChange={(e) => setChannelKind(e.target.value as Kind)} aria-label="Channel type" className="rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm px-2 text-zinc-800 dark:text-zinc-200"><option value="TEXT">Text</option><option value="ANNOUNCE">Announcements</option><option value="VOICE">Voice</option></select>
                <button type="button" disabled={!channelName.trim()} onClick={async () => { if (await post({ action: 'channel', name: channelName, kind: channelKind }, 'Channel added')) { setChannelName(''); onClose(); } }} className="btn-primary shrink-0"><Plus className="w-4 h-4" /></button>
              </div>
            </section>
          )}

          <section className="space-y-2">
            <div className="flex items-center justify-between"><p className="text-xs font-semibold text-zinc-500">{data.members.length} members</p>{mod && <button type="button" onClick={() => setAdding(!adding)} className="text-xs font-semibold text-indigo-500 inline-flex items-center gap-1"><UserPlus className="w-3.5 h-3.5" /> Add people</button>}</div>
            {adding && (
              <div className="rounded-2xl border border-zinc-200 dark:border-white/10 p-2 space-y-1">
                <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className={cn(input, 'pl-9')} /></div>
                {people?.filter((p) => !data.members.some((m) => m.id === p.id)).slice(0, 8).map((p) => (
                  <button key={p.id} type="button" onClick={() => void post({ action: 'add', userIds: [p.id] }, `${p.name.split(' ')[0]} added`)} className="w-full flex items-center gap-2 p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-left"><Avatar name={p.name} src={p.avatar} size={30} /><span className="flex-1 text-sm text-zinc-800 dark:text-zinc-200 truncate">{p.name}</span><Plus className="w-4 h-4 text-indigo-500" /></button>
                ))}
              </div>
            )}
            <ul className="space-y-0.5">{data.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 py-1.5">
                <Avatar name={m.name} src={m.avatar} size={32} />
                <span className="flex-1 min-w-0 text-sm text-zinc-800 dark:text-zinc-200 truncate">{m.name}</span>
                {m.communityRole === 'OWNER' ? <span className="text-[10px] font-bold uppercase text-amber-500 inline-flex items-center gap-0.5"><Crown className="w-3 h-3" /> Owner</span>
                  : m.communityRole === 'MOD' ? <span className="text-[10px] font-bold uppercase text-indigo-500 inline-flex items-center gap-0.5"><Shield className="w-3 h-3" /> Mod</span> : null}
                {owner && m.communityRole !== 'OWNER' && <button type="button" onClick={() => void post({ action: 'member', userId: m.id, role: m.communityRole === 'MOD' ? 'MEMBER' : 'MOD' }, m.communityRole === 'MOD' ? 'No longer a moderator' : 'Now a moderator')} className="text-[11px] font-semibold text-indigo-500 px-1.5">{m.communityRole === 'MOD' ? 'Remove mod' : 'Make mod'}</button>}
                {mod && m.communityRole === 'MEMBER' && <button type="button" aria-label={`Remove ${m.name}`} onClick={async () => { if (await confirmDialog({ title: `Remove ${m.name.split(' ')[0]}?`, destructive: true })) void post({ action: 'member', userId: m.id, remove: true }, 'Removed'); }} className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500"><UserMinus className="w-3.5 h-3.5" /></button>}
              </li>
            ))}</ul>
          </section>

          <section className="pt-2 border-t border-zinc-200 dark:border-white/10 flex flex-col gap-2">
            <button type="button" onClick={async () => { if (!(await confirmDialog({ title: `Leave ${community.name}?`, destructive: true }))) return; if (await post({ action: 'leave' }, 'You left the community')) onClose(); }} className="text-sm font-semibold text-rose-500 inline-flex items-center gap-2"><LogOut className="w-4 h-4" /> Leave community</button>
            {owner && <button type="button" onClick={async () => { if (!(await confirmDialog({ title: `Delete ${community.name}?`, message: 'Every channel and message in it is deleted for everyone.', confirmLabel: 'Delete', destructive: true }))) return; try { await chatJson(`/api/chat/communities/${community.id}`, { method: 'PATCH', body: JSON.stringify({ delete: true }) }); toast.success('Community deleted'); onClose(); } catch (e) { toast.error((e as Error).message); } }} className="text-sm font-semibold text-rose-500 inline-flex items-center gap-2"><Trash2 className="w-4 h-4" /> Delete community</button>}
          </section>
        </>
      )}
    </Sheet>
  );
}
