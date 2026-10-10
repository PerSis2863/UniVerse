'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { ImagePlus, Loader2, Pencil, Plus, Sticker as StickerIcon, Trash2, X } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Switch } from '@/components/ui/Switch';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { cn } from '@/lib/utils';
import { chatJson, uploadChatFile } from './chat-client';

// Sticker packs (Stage 5 · B7.2; src/server/stickers.ts): a picker by the message box (the school's
// packs, then your own) and an editor to make a pack from your own images. A sticker is sent as a
// photo shown large, without a bubble.

export interface StickerPack { id: string; name: string; school: boolean; canEdit: boolean; stickers: { id: string; url: string; label: string }[] }
interface Packs { packs: StickerPack[]; canMakeSchool: boolean }
const KEY = '/api/chat/stickers';
const MAX_BYTES = 1024 * 1024;

export function StickerPicker({ onPick, onClose }: { onPick: (s: { url: string; label: string }) => void; onClose: () => void }) {
  const { data, mutate } = useSWR<Packs>(KEY, authedJson, { revalidateOnFocus: false });
  const [packId, setPackId] = useState<string | null>(null);
  const [editing, setEditing] = useState<StickerPack | 'new' | null>(null);
  const packs = data?.packs ?? [];
  const pack = packs.find((p) => p.id === packId) ?? packs.find((p) => p.stickers.length) ?? packs[0];
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} aria-hidden />
      <div role="dialog" aria-label="Stickers" className="relative z-30 w-[min(92vw,20rem)] rounded-2xl bg-white dark:bg-[#121830] border border-zinc-200 dark:border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-1 px-2 pt-2">
          <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Sticker packs">
          {packs.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={pack?.id === p.id} onClick={() => setPackId(p.id)}
              className={cn('shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap', pack?.id === p.id ? 'bg-indigo-500 text-white' : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10')}>
              {p.school ? '🏫 ' : ''}{p.name}
            </button>
          ))}
          </div>
          <button type="button" onClick={() => setEditing('new')} aria-label="New sticker pack" title="New sticker pack" className="shrink-0 w-7 h-7 grid place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><Plus className="w-4 h-4" /></button>
        </div>
        <div className="h-56 overflow-y-auto p-2">
          {!data && <div className="h-full grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" aria-label="Loading" /></div>}
          {data && !pack && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-4">
              <StickerIcon className="w-8 h-8 text-zinc-300 dark:text-zinc-600" aria-hidden />
              <p className="text-sm text-zinc-500">No stickers yet. Make a pack from your own images.</p>
              <button type="button" onClick={() => setEditing('new')} className="btn-primary btn-sm"><Plus className="w-3.5 h-3.5" />Make a pack</button>
            </div>
          )}
          {pack && !pack.stickers.length && <p className="text-sm text-zinc-500 text-center pt-16">This pack is empty.{pack.canEdit ? ' Add images to it.' : ''}</p>}
          {pack && pack.stickers.length > 0 && (
            <ul className="grid grid-cols-4 gap-1">
              {pack.stickers.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => onPick({ url: s.url, label: s.label })} aria-label={s.label ? `Send sticker: ${s.label}` : 'Send sticker'} className="w-full aspect-square rounded-xl p-1 hover:bg-zinc-100 dark:hover:bg-white/10">
                    <img src={s.url} alt="" className="w-full h-full object-contain" loading="lazy" draggable={false} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {pack?.canEdit && (
          <div className="border-t border-zinc-100 dark:border-white/[0.06] px-2 py-1.5 flex justify-end">
            <button type="button" onClick={() => setEditing(pack)} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1 px-2 py-1"><Pencil className="w-3.5 h-3.5" />Edit pack</button>
          </div>
        )}
      </div>
      {editing && <PackEditor pack={editing === 'new' ? null : editing} canMakeSchool={!!data?.canMakeSchool} onClose={() => setEditing(null)} onSaved={(p) => { void mutate(); if (p) setPackId(p.id); }} />}
    </>
  );
}

function PackEditor({ pack: initial, canMakeSchool, onClose, onSaved }: { pack: StickerPack | null; canMakeSchool: boolean; onClose: () => void; onSaved: (p: StickerPack | null) => void }) {
  const [pack, setPack] = useState<StickerPack | null>(initial);
  const [name, setName] = useState(initial?.name ?? '');
  const [school, setSchool] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = async (what: string, fn: () => Promise<StickerPack | null>) => {
    setBusy(what);
    try { const p = await fn(); if (p) setPack(p); onSaved(p); return p; } catch (e) { toast.error((e as Error).message); return null; } finally { setBusy(null); }
  };
  const create = () => run('create', () => chatJson<StickerPack>(KEY, { method: 'POST', body: JSON.stringify({ name, school }) }));
  const act = (body: Record<string, unknown>) => chatJson<StickerPack>(`${KEY}/${pack!.id}`, { method: 'POST', body: JSON.stringify(body) });
  const add = async (files: FileList | null) => {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (!list.length || !pack) return;
    const big = list.filter((f) => f.size > MAX_BYTES);
    if (big.length) toast.error(`${big.length === 1 ? 'One image is' : `${big.length} images are`} over 1 MB and left out.`);
    const ok = list.filter((f) => f.size <= MAX_BYTES).slice(0, 30 - pack.stickers.length);
    if (!ok.length) return;
    await run('add', async () => {
      const stickers: { url: string; label: string }[] = [];
      for (const f of ok) stickers.push({ url: await uploadChatFile(f), label: f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 40) });
      return act({ action: 'add', stickers });
    });
    if (fileRef.current) fileRef.current.value = '';
  };
  const remove = async () => {
    if (!pack || !(await confirmDialog({ title: `Delete “${pack.name}”?`, message: pack.school ? 'It goes for everyone at school. Stickers already sent stay in their chats.' : 'Stickers already sent stay in their chats.', destructive: true, confirmLabel: 'Delete' }))) return;
    await run('delete', async () => { await act({ action: 'delete' }); return null; });
    onClose();
  };
  return (
    <Sheet title={pack ? 'Edit sticker pack' : 'New sticker pack'} onClose={onClose}>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!pack) void create(); else if (name.trim() && name !== pack.name) void run('rename', () => act({ action: 'rename', name })); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Pack name, like Class jokes" aria-label="Pack name" className="input flex-1 min-w-0" />
        <button type="submit" disabled={!name.trim() || !!busy || (!!pack && name === pack.name)} className="btn-primary shrink-0">{busy === 'create' || busy === 'rename' ? <Loader2 className="w-4 h-4 animate-spin" /> : pack ? 'Rename' : 'Create'}</button>
      </form>
      {!pack && canMakeSchool && (
        <label className="mt-3 flex items-center justify-between gap-3 text-sm text-zinc-700 dark:text-zinc-300">
          <span>For everyone at school<span className="block text-xs text-zinc-500">Everyone sees it in their stickers.</span></span>
          <Switch checked={school} onChange={setSchool} label="For everyone at school" />
        </label>
      )}
      {pack && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{pack.stickers.length} of 30 stickers{pack.school ? ' · for everyone at school' : ''}</p>
            <input ref={fileRef} type="file" accept="image/png,image/webp,image/gif,image/jpeg" multiple className="hidden" onChange={(e) => void add(e.target.files)} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy || pack.stickers.length >= 30} className="btn-secondary btn-sm">{busy === 'add' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}Add images</button>
          </div>
          {pack.stickers.length ? (
            <ul className="grid grid-cols-4 gap-2">
              {pack.stickers.map((s) => (
                <li key={s.id} className="relative aspect-square rounded-xl border border-zinc-200 dark:border-white/10 p-1">
                  <img src={s.url} alt={s.label} className="w-full h-full object-contain" />
                  <button type="button" onClick={() => void run(s.id, () => act({ action: 'remove', stickerId: s.id }))} disabled={!!busy} aria-label={`Remove ${s.label || 'sticker'}`} className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-zinc-900/80 text-white grid place-items-center"><X className="w-3.5 h-3.5" /></button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-zinc-500">PNG, WebP or GIF images up to 1 MB work best, ideally square with a see-through background.</p>}
          <button type="button" onClick={() => void remove()} disabled={!!busy} className="mt-5 text-sm font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5"><Trash2 className="w-4 h-4" />Delete pack</button>
        </div>
      )}
    </Sheet>
  );
}
