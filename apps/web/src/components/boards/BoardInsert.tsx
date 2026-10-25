'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Loader2, Network, Search, Shapes } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { authedJson } from '@/lib/authed-fetch';
import type { BoardControls } from './BoardCanvas';
import { LIBRARIES, place, STAMPS, stamp } from './library';
import { TEMPLATES, templateElements } from './templates';
import { drawMindMap } from './board-ai-draw';
import { outlineToMap } from '@/lib/outline-map';

// Add to a whiteboard (Stage 5 · B9.11): a template beside what's there, ready-made science /
// maths / geography shapes, stamps, pictures from the files hub (My files, classes, groups), and
// (M17) a mind map drawn from an outline typed or pasted in.

type Tab = 'templates' | 'shapes' | 'stamps' | 'files' | 'text';
interface HubFile { id: string; name: string; url: string; mime: string; space: { label: string } }

export function BoardInsert({ controls, disabled, className }: { controls: React.RefObject<BoardControls | null>; disabled: boolean; className: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('templates');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [outline, setOutline] = useState('');
  const map = outlineToMap(outline);
  const query = q.trim().length >= 2 ? `q=${encodeURIComponent(q.trim())}` : 'view=recent';
  const { data: files } = useSWR<{ files: HubFile[] }>(open && tab === 'files' ? `/api/files-hub?${query}` : null, authedJson);
  const pictures = files?.files.filter((f) => f.mime.startsWith('image/') && !/svg/.test(f.mime)) ?? [];

  const add = (build: (o: { x: number; y: number }) => ReturnType<typeof place>) => { controls.current?.addElements(build); setOpen(false); };
  const addPicture = async (f: HubFile) => {
    setBusy(f.id);
    try {
      const res = await fetch(f.url, { credentials: 'omit' });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      await controls.current?.addPhoto(new File([blob], f.name, { type: blob.type || f.mime }));
      setOpen(false);
    } catch { toast.error('Couldn’t add that picture.'); }
    finally { setBusy(null); }
  };
  const item = 'px-2.5 py-2 rounded-xl text-start text-sm text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/[0.06]';

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} disabled={disabled} className={className} title="Add templates, shapes, stamps or pictures" aria-expanded={open}>
        <Shapes className="w-4 h-4" /><span className="hidden md:inline">Add</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Add to the board" className="absolute end-0 top-11 z-40 w-[22rem] max-sm:fixed max-sm:inset-x-4 max-sm:top-16 max-sm:w-auto rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-white/10 shadow-2xl p-2 space-y-2" onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
          <Segmented<Tab> segments={[{ value: 'templates', label: 'Templates' }, { value: 'shapes', label: 'Shapes' }, { value: 'stamps', label: 'Stamps' }, { value: 'files', label: 'Pictures' }, { value: 'text', label: 'From text' }]} value={tab} onChange={setTab} label="Add" className="w-full" />
          <div className="max-h-[60vh] overflow-y-auto">
            {tab === 'templates' && (
              <ul className="grid grid-cols-2 gap-1">
                {TEMPLATES.filter((t) => t.id !== 'blank').map((t) => (
                  <li key={t.id}><button type="button" onClick={() => add((o) => place(templateElements(t.id), o))} className={`${item} w-full`} title={t.description}><span className="block font-semibold">{t.name}</span><span className="block text-[11px] text-zinc-500 line-clamp-2">{t.description}</span></button></li>
                ))}
              </ul>
            )}
            {tab === 'shapes' && LIBRARIES.map((lib) => (
              <section key={lib.id} aria-label={lib.name} className="mb-2">
                <p className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{lib.name}</p>
                <ul className="grid grid-cols-2 gap-1">
                  {lib.items.map((it) => <li key={it.id}><button type="button" onClick={() => add((o) => place(it.build(), o))} className={`${item} w-full`}>{it.name}</button></li>)}
                </ul>
              </section>
            ))}
            {tab === 'stamps' && (
              <ul className="grid grid-cols-5 gap-1 p-1">
                {STAMPS.map((s) => <li key={s}><button type="button" onClick={() => add((o) => place(stamp(s), o))} aria-label={`Stamp ${s}`} className="w-full aspect-square rounded-xl text-2xl hover:bg-zinc-100 dark:hover:bg-white/[0.06]">{s}</button></li>)}
              </ul>
            )}
            {tab === 'text' && (
              <div className="space-y-2 p-1">
                <label className="block text-xs text-zinc-600 dark:text-zinc-400" htmlFor="outline-in">Type or paste an outline: the first line is the centre, indented or “-” lines are its branches, deeper lines their ideas.</label>
                <textarea id="outline-in" value={outline} onChange={(e) => setOutline(e.target.value.slice(0, 4000))} rows={8} placeholder={'Photosynthesis\n  Inputs\n    Light\n    Water\n  Outputs\n    Oxygen'}
                  className="input font-mono text-xs leading-relaxed resize-y" />
                <button type="button" disabled={!map?.branches.length} onClick={() => map && add((o) => drawMindMap(map)(o))} className="btn-primary w-full justify-center">
                  <Network className="w-4 h-4" /> Draw the mind map{map?.branches.length ? ` (${map.branches.length} branch${map.branches.length === 1 ? '' : 'es'})` : ''}
                </button>
              </div>
            )}
            {tab === 'files' && (
              <div className="space-y-2 p-1">
                <label className="relative block">
                  <span className="sr-only">Find a picture</span>
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute start-2.5 top-1/2 -translate-y-1/2" aria-hidden />
                  <input value={q} onChange={(e) => setQ(e.target.value.slice(0, 80))} placeholder="Search your files, classes and groups" className="input py-1.5 ps-8 text-sm" />
                </label>
                {!files ? <div className="h-24 rounded-xl skeleton" /> : !pictures.length ? <p className="text-xs text-zinc-500 px-1">No pictures {q.trim().length >= 2 ? 'match' : 'changed lately'}. Upload them in Collaborate → Files.</p> : (
                  <ul className="grid grid-cols-3 gap-1.5">
                    {pictures.slice(0, 30).map((f) => (
                      <li key={f.id}>
                        <button type="button" onClick={() => void addPicture(f)} disabled={!!busy} title={`${f.name} · ${f.space.label}`} className="relative block w-full aspect-square rounded-xl overflow-hidden border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 bg-cover bg-center disabled:opacity-60" style={{ backgroundImage: `url(${f.url})` }}>
                          <span className="sr-only">Add {f.name}</span>
                          {busy === f.id && <span className="absolute inset-0 grid place-items-center bg-black/30"><Loader2 className="w-5 h-5 animate-spin text-white" aria-hidden /></span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
