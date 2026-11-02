'use client';

import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import { ChevronDown, ChevronRight, Download, GripHorizontal, Plus, Printer, RotateCcw, Shuffle, ThumbsUp, Trash2 } from 'lucide-react';
import { decide, flow, streaks, treeLayout, type MindNode } from '@/lib/big-tools';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Btn, Field, area, copy, save } from './QuickTools';
import { printOnly, svgToPng, today, uid, useKept } from './kept';

// Collaborate → Create → Plan and organise (M72, the owner: "add more 30 features… like big features").
// Each tool keeps its work on this device (localStorage) and saves pictures or prints; nothing is sent.

export type PlanId = 'mindmap' | 'outline' | 'stickies' | 'gantt' | 'timetable' | 'habits' | 'decide' | 'flow';

export function PlanTool({ id }: { id: PlanId }) {
  const T = { mindmap: MindMap, outline: Outline, stickies: Stickies, gantt: Gantt, timetable: Timetable, habits: Habits, decide: Decide, flow: Flow }[id];
  return <T />;
}

export const BRANCH = ['#533ff6', '#ec74ce', '#0d9488', '#d97706', '#2563eb', '#dc2626', '#7c3aed', '#059669'];
const savePng = async (svg: SVGSVGElement | null, name: string) => { if (!svg) return; try { save(name, await svgToPng(svg), 'image/png'); } catch (e) { toast.error((e as Error).message); } };
const reset = (msg: string, go: () => void) => { if (window.confirm(msg)) go(); };

/** Mind map: ideas branching from one big idea. Tab adds inside, Enter beside, arrows move. */
function MindMap() {
  const [nodes, setNodes] = useKept<MindNode[]>('uv-mindmap', () => [
    { id: 'root', parent: null, text: 'Our project' }, { id: 'a', parent: 'root', text: 'Research' }, { id: 'b', parent: 'root', text: 'Design' },
    { id: 'c', parent: 'a', text: 'Interviews' }, { id: 'd', parent: 'a', text: 'Reading' }, { id: 'e', parent: 'b', text: 'Sketches' },
  ]);
  const [sel, setSel] = useState('root');
  const svgRef = useRef<SVGSVGElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const pos = useMemo(() => treeLayout(nodes), [nodes]);
  const w = (t: string) => Math.min(220, Math.max(64, t.length * 7.4 + 28));
  const by = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const depthX = useMemo(() => {
    const max: number[] = [];
    for (const n of nodes) { const d = pos.get(n.id)?.depth ?? 0; max[d] = Math.max(max[d] ?? 0, w(n.text)); }
    const xs = [20]; for (let d = 1; d <= max.length; d++) xs[d] = xs[d - 1] + (max[d - 1] ?? 0) + 56;
    return xs;
  }, [nodes, pos]);
  const rows = Math.max(1, ...[...pos.values()].map((p) => p.row + 1));
  const W = depthX[depthX.length - 1] + 20, H = rows * 52 + 24;
  const branchOf = useMemo(() => {
    const m = new Map<string, number>(), root = nodes.find((n) => !n.parent);
    const walk = (id: string, b: number) => { m.set(id, b); nodes.filter((n) => n.parent === id).forEach((n) => walk(n.id, b)); };
    nodes.filter((n) => n.parent === root?.id).forEach((k, i) => walk(k.id, i));
    return m;
  }, [nodes]);
  const branch = (id: string) => branchOf.get(id) ?? 0;
  const at = (id: string) => { const p = pos.get(id)!; return { x: depthX[p.depth], y: p.row * 52 + 12 }; };
  const focusName = () => requestAnimationFrame(() => nameRef.current?.select());
  const add = (parent: string) => { const n = { id: uid(), parent, text: 'New idea' }; setNodes([...nodes, n]); setSel(n.id); focusName(); };
  const remove = (id: string) => {
    const node = by.get(id); if (!node?.parent) return;
    const gone = new Set([id]); let grew = true;
    while (grew) { grew = false; for (const n of nodes) if (n.parent && gone.has(n.parent) && !gone.has(n.id)) { gone.add(n.id); grew = true; } }
    setNodes(nodes.filter((n) => !gone.has(n.id))); setSel(node.parent);
  };
  const cur = by.get(sel) ?? nodes[0];
  const key = (e: React.KeyboardEvent) => {
    if (!cur) return;
    const sibs = nodes.filter((n) => n.parent === cur.parent), k = sibs.findIndex((n) => n.id === cur.id);
    const go = (id?: string) => { if (id) { e.preventDefault(); setSel(id); } };
    if (e.key === 'Tab') { e.preventDefault(); add(cur.id); }
    else if (e.key === 'Enter') { e.preventDefault(); add(cur.parent ?? cur.id); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(cur.id); }
    else if (e.key === 'ArrowLeft') go(cur.parent ?? undefined);
    else if (e.key === 'ArrowRight') go(nodes.find((n) => n.parent === cur.id)?.id);
    else if (e.key === 'ArrowUp') go(sibs[k - 1]?.id);
    else if (e.key === 'ArrowDown') go(sibs[k + 1]?.id);
    else if (e.key === 'F2') { e.preventDefault(); focusName(); }
  };
  const outline = () => { const lines: string[] = []; const walk = (id: string, d: number) => { lines.push(`${'  '.repeat(d)}- ${by.get(id)?.text}`); nodes.filter((n) => n.parent === id).forEach((n) => walk(n.id, d + 1)); }; if (nodes[0]) walk(nodes[0].id, 0); return lines.join('\n'); };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Idea"><input ref={nameRef} className="input w-56" value={cur?.text ?? ''} onChange={(e) => setNodes(nodes.map((n) => (n.id === cur?.id ? { ...n, text: e.target.value.slice(0, 60) } : n)))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); mapRef.current?.focus(); } }} /></Field>
        <Btn onClick={() => cur && add(cur.id)}><Plus className="w-3.5 h-3.5" aria-hidden />Inside (Tab)</Btn>
        <Btn onClick={() => cur && add(cur.parent ?? cur.id)}><Plus className="w-3.5 h-3.5" aria-hidden />Beside (Enter)</Btn>
        <Btn onClick={() => cur && remove(cur.id)}><Trash2 className="w-3.5 h-3.5" aria-hidden />Remove</Btn>
        <Btn onClick={() => void savePng(svgRef.current, 'mind-map.png')}><Download className="w-3.5 h-3.5" aria-hidden />Save picture</Btn>
        <Btn onClick={() => void copy(outline())}>Copy as list</Btn>
        <Btn onClick={() => reset('Start a new mind map? This one will be cleared.', () => { setNodes([{ id: 'root', parent: null, text: 'Big idea' }]); setSel('root'); })}><RotateCcw className="w-3.5 h-3.5" aria-hidden />New</Btn>
      </div>
        <div ref={mapRef} tabIndex={0} role="application" aria-label="Mind map. Arrows move between ideas, Tab adds an idea inside, Enter adds one beside, Delete removes, F2 renames." onKeyDown={key} className="rounded-2xl bg-white ring-1 ring-black/10 overflow-auto max-h-[560px] focus-visible:outline-2 focus-visible:outline-pink-500">
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H} xmlns="http://www.w3.org/2000/svg" className="block" fontFamily="system-ui, sans-serif">
            {nodes.filter((n) => n.parent && pos.has(n.id) && pos.has(n.parent)).map((n) => {
              const a = at(n.parent!), b = at(n.id), x1 = a.x + w(by.get(n.parent!)!.text), y1 = a.y + 18, y2 = b.y + 18, mid = (x1 + b.x) / 2;
              return <motion.path key={`e${n.id}`} initial={false} animate={{ d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${b.x},${y2}` }} transition={spring.smooth} fill="none" stroke={BRANCH[branch(n.id) % BRANCH.length]} strokeWidth={2.5} strokeLinecap="round" opacity={0.7} />;
            })}
            {nodes.filter((n) => pos.has(n.id)).map((n) => {
              const p = at(n.id), root = !n.parent, c = BRANCH[branch(n.id) % BRANCH.length], on = n.id === cur?.id;
              return (
                <motion.g key={n.id} initial={{ opacity: 0, x: p.x - 12, y: p.y }} animate={{ opacity: 1, x: p.x, y: p.y }} transition={spring.smooth} onClick={() => setSel(n.id)} onDoubleClick={focusName} style={{ cursor: 'pointer' }}>
                  <rect width={w(n.text)} height={36} rx={18} fill={root ? '#171f44' : `${c}1f`} stroke={on ? '#ec4899' : root ? '#171f44' : c} strokeWidth={on ? 3 : 1.5} />
                  <text x={w(n.text) / 2} y={23} textAnchor="middle" fontSize={13} fontWeight={root ? 700 : 600} fill={root ? '#ffffff' : '#141320'}>{n.text.length > 26 ? `${n.text.slice(0, 25)}…` : n.text}</text>
                </motion.g>
              );
            })}
          </svg>
        </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Click an idea to choose it, double-click to rename. Kept on this device.</p>
    </div>
  );
}

interface Item { id: string; text: string; depth: number; done?: boolean; shut?: boolean }
/** Outliner: nested bullet points. Tab and Shift+Tab move in and out, Alt+arrows move a line. */
function Outline() {
  const [items, setItems] = useKept<Item[]>('uv-outline', () => [{ id: uid(), text: 'Essay plan', depth: 0 }, { id: uid(), text: 'Introduction', depth: 1 }, { id: uid(), text: 'Three arguments', depth: 1 }, { id: uid(), text: 'Conclusion', depth: 1 }]);
  const refs = useRef(new Map<string, HTMLInputElement>());
  const focus = (id?: string, end = true) => requestAnimationFrame(() => { const el = id && refs.current.get(id); if (el) { el.focus(); if (end) el.setSelectionRange(el.value.length, el.value.length); } });
  const hidden = useMemo(() => {
    const out = new Set<string>(); let shutAt = -1;
    for (const it of items) { if (shutAt >= 0 && it.depth > shutAt) { out.add(it.id); continue; } shutAt = it.shut ? it.depth : -1; }
    return out;
  }, [items]);
  const hasKids = (k: number) => (items[k + 1]?.depth ?? -1) > items[k].depth;
  const block = (k: number) => { let e = k + 1; while (e < items.length && items[e].depth > items[k].depth) e++; return e; };
  const patch = (id: string, p: Partial<Item>) => setItems(items.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const key = (e: React.KeyboardEvent<HTMLInputElement>, k: number) => {
    const it = items[k];
    if (e.key === 'Enter') { e.preventDefault(); const n = { id: uid(), text: '', depth: it.depth }; const next = [...items]; next.splice(it.shut ? block(k) : k + 1, 0, n); setItems(next); focus(n.id); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const d = e.shiftKey ? Math.max(0, it.depth - 1) : Math.min((items[k - 1]?.depth ?? -1) + 1, it.depth + 1);
      const shift = d - it.depth, end = block(k);
      setItems(items.map((x, j) => (j >= k && j < end ? { ...x, depth: x.depth + shift } : x))); focus(it.id);
    } else if (e.key === 'Backspace' && !it.text && items.length > 1) { e.preventDefault(); const prev = items.slice(0, k).reverse().find((x) => !hidden.has(x.id)); setItems(items.filter((x) => x.id !== it.id)); focus(prev?.id ?? items[k + 1]?.id); }
    else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const end = block(k), chunk = items.slice(k, end), rest = [...items.slice(0, k), ...items.slice(end)];
      let to = k;
      if (e.key === 'ArrowUp') { to = k - 1; while (to > 0 && rest[to].depth > it.depth) to--; to = Math.max(0, to); }
      else { if (end >= items.length) return; const after = block(end); to = k + (after - end); }
      rest.splice(to, 0, ...chunk); setItems(rest); focus(it.id);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault(); const dir = e.key === 'ArrowUp' ? -1 : 1;
      for (let j = k + dir; j >= 0 && j < items.length; j += dir) if (!hidden.has(items[j].id)) { focus(items[j].id); break; }
    }
  };
  const md = () => items.map((i) => `${'  '.repeat(i.depth)}- ${i.done ? '[x] ' : ''}${i.text}`).join('\n');
  const done = items.filter((i) => i.done).length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => void copy(md())}>Copy as Markdown</Btn>
        <Btn onClick={() => save('outline.md', md(), 'text/markdown')}><Download className="w-3.5 h-3.5" aria-hidden />Download</Btn>
        <Btn onClick={() => setItems(items.map((i) => ({ ...i, shut: false })))}>Open all</Btn>
        <Btn onClick={() => reset('Clear the outline?', () => setItems([{ id: uid(), text: '', depth: 0 }]))}><RotateCcw className="w-3.5 h-3.5" aria-hidden />New</Btn>
        <span className="text-xs text-zinc-600 dark:text-zinc-300 self-center tabular-nums" role="status">{items.length} lines{done ? ` · ${done} done` : ''}</span>
      </div>
      <ul className="rounded-2xl ring-1 ring-zinc-200 dark:ring-white/10 p-2 sm:p-3 space-y-0.5" aria-label="Outline">
        {items.map((it, k) => !hidden.has(it.id) && (
          <motion.li key={it.id} layout="position" transition={spring.snappy} className="flex items-center gap-1" style={{ paddingInlineStart: it.depth * 22 }}>
            <button type="button" onClick={() => patch(it.id, { shut: !it.shut })} disabled={!hasKids(k)} aria-label={it.shut ? 'Open' : 'Fold'} aria-expanded={hasKids(k) ? !it.shut : undefined} className="w-6 h-8 grid place-items-center text-zinc-500 disabled:opacity-0">
              {it.shut ? <ChevronRight className="w-4 h-4 rtl:rotate-180" aria-hidden /> : <ChevronDown className="w-4 h-4" aria-hidden />}
            </button>
            <input type="checkbox" checked={!!it.done} onChange={(e) => patch(it.id, { done: e.target.checked })} aria-label={`Done: ${it.text || 'empty line'}`} className="accent-pink-500 w-4 h-4" />
            <input ref={(el) => { if (el) refs.current.set(it.id, el); else refs.current.delete(it.id); }} value={it.text} onChange={(e) => patch(it.id, { text: e.target.value })} onKeyDown={(e) => key(e, k)} aria-label={`Line ${k + 1}, level ${it.depth + 1}`}
              className={cn('flex-1 min-w-0 bg-transparent px-2 py-1.5 rounded-lg outline-none focus:bg-zinc-100 dark:focus:bg-white/[0.06] text-zinc-900 dark:text-white', it.depth === 0 && 'font-bold', it.done && 'line-through text-zinc-500 dark:text-zinc-400')} placeholder="Type…" />
          </motion.li>
        ))}
      </ul>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Enter: new line · Tab / Shift+Tab: in and out · Alt+↑↓: move a line with what&rsquo;s under it · Backspace on an empty line: remove.</p>
    </div>
  );
}

interface Sticky { id: string; text: string; x: number; y: number; c: number; votes: number }
const PAPER = ['#fde68a', '#fbcfe8', '#bae6fd', '#bbf7d0', '#ddd6fe'];
/** Brainstorm wall: sticky notes to drag around, colour and vote on. */
function Stickies() {
  const [notes, setNotes] = useKept<Sticky[]>('uv-stickies', () => ['What went well?', 'What to try next', 'Questions'].map((text, k) => ({ id: uid(), text, x: 24 + k * 196, y: 24, c: k, votes: 0 })));
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; x: number; y: number } | null>(null);
  const NW = 176, NH = 150;
  const clamp = (x: number, y: number) => { const b = board.current; return b ? { x: Math.max(0, Math.min(b.clientWidth - NW, x)), y: Math.max(0, Math.min(b.clientHeight - NH, y)) } : { x, y }; };
  const move = (id: string, x: number, y: number) => setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, ...clamp(x, y) } : n)));
  const down = (e: React.PointerEvent<HTMLDivElement>, n: Sticky) => {
    const el = e.currentTarget.parentElement!; e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: n.id, sx: e.clientX - n.x, sy: e.clientY - n.y, x: n.x, y: n.y };
    el.style.transition = 'none'; el.style.zIndex = '20'; el.dataset.lift = '1';
  };
  const moveP = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d) return;
    const p = clamp(e.clientX - d.sx, e.clientY - d.sy); d.x = p.x; d.y = p.y;
    e.currentTarget.parentElement!.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(-1.5deg) scale(1.04)`;
  };
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d) return; drag.current = null;
    const el = e.currentTarget.parentElement!; el.style.transition = ''; el.style.zIndex = ''; delete el.dataset.lift;
    move(d.id, d.x, d.y);
  };
  const add = () => { const b = board.current; const n: Sticky = { id: uid(), text: '', x: Math.random() * Math.max(0, (b?.clientWidth ?? 400) - NW), y: Math.random() * 200, c: notes.length % PAPER.length, votes: 0 }; setNotes([...notes, n]); };
  const tidy = () => { const cols = Math.max(1, Math.floor((board.current?.clientWidth ?? 600) / (NW + 12))); setNotes([...notes].sort((a, b) => b.votes - a.votes).map((n, k) => ({ ...n, x: 12 + (k % cols) * (NW + 12), y: 12 + Math.floor(k / cols) * (NH + 12) }))); };
  const rows = Math.max(3, Math.ceil(notes.length / 3) + 1);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Btn onClick={add}><Plus className="w-3.5 h-3.5" aria-hidden />Add a note</Btn>
        <Btn onClick={tidy}><Shuffle className="w-3.5 h-3.5" aria-hidden />Line up by votes</Btn>
        <Btn onClick={() => void copy([...notes].sort((a, b) => b.votes - a.votes).map((n) => `- ${n.text}${n.votes ? ` (${n.votes} votes)` : ''}`).join('\n'))}>Copy as list</Btn>
        <Btn onClick={() => reset('Clear the wall?', () => setNotes([]))}><RotateCcw className="w-3.5 h-3.5" aria-hidden />Clear</Btn>
      </div>
      <div ref={board} className="relative rounded-2xl bg-zinc-100 dark:bg-white/[0.04] ring-1 ring-zinc-200 dark:ring-white/10 overflow-hidden" style={{ height: Math.min(900, rows * (NH + 12) + 12), backgroundImage: 'radial-gradient(rgb(120 120 140 / 0.25) 1px, transparent 1px)', backgroundSize: '22px 22px' }}>
        {notes.map((n) => (
          <div key={n.id} className="absolute top-0 start-0 rounded-xl shadow-md transition-[transform,box-shadow] duration-300 ease-[var(--ease-glide)] data-[lift]:shadow-2xl" style={{ width: NW, height: NH, background: PAPER[n.c], transform: `translate3d(${n.x}px, ${n.y}px, 0)` }}>
            <div onPointerDown={(e) => down(e, n)} onPointerMove={moveP} onPointerUp={up} onPointerCancel={up}
              className="h-7 flex items-center justify-between px-2 cursor-grab active:cursor-grabbing touch-none text-zinc-700 rounded-t-xl">
              <button type="button" aria-label="Move the note (arrow keys)" onKeyDown={(e) => { const s = e.shiftKey ? 48 : 16, d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key]; if (d) { e.preventDefault(); move(n.id, n.x + d[0], n.y + d[1]); } }} className="rounded focus-visible:outline-2 focus-visible:outline-pink-600"><GripHorizontal className="w-4 h-4" aria-hidden /></button>
              <span className="flex items-center gap-1">
                {PAPER.map((p, c) => <button key={p} type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => setNotes(notes.map((x) => (x.id === n.id ? { ...x, c } : x)))} aria-label={`Colour ${c + 1}`} className="w-3.5 h-3.5 rounded-full ring-1 ring-black/20" style={{ background: p }} />)}
                <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => setNotes(notes.filter((x) => x.id !== n.id))} aria-label="Remove the note" className="ms-1"><Trash2 className="w-3.5 h-3.5" aria-hidden /></button>
              </span>
            </div>
            <textarea value={n.text} onChange={(e) => setNotes(notes.map((x) => (x.id === n.id ? { ...x, text: e.target.value } : x)))} aria-label="Note" placeholder="Write an idea…" className="w-full h-[88px] resize-none bg-transparent px-3 text-sm text-zinc-900 placeholder:text-zinc-600 outline-none" />
            <button type="button" onClick={() => setNotes(notes.map((x) => (x.id === n.id ? { ...x, votes: x.votes + 1 } : x)))} onContextMenu={(e) => { e.preventDefault(); setNotes(notes.map((x) => (x.id === n.id ? { ...x, votes: Math.max(0, x.votes - 1) } : x))); }} className="absolute bottom-1.5 end-2 inline-flex items-center gap-1 rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold text-zinc-900 active:scale-90 transition-transform">
              <ThumbsUp className="w-3 h-3" aria-hidden /><span className="sr-only">Vote; votes so far:</span><span className="tabular-nums">{n.votes}</span>
            </button>
          </div>
        ))}
        {!notes.length && <p className="absolute inset-0 grid place-items-center text-sm text-zinc-600 dark:text-zinc-300">Add a note to start.</p>}
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Drag a note by its top strip. Right-click the vote to take one back. Kept on this device.</p>
    </div>
  );
}

interface Bar { id: string; name: string; start: string; end: string; done: number }
const addD = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const span = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
/** Timeline (Gantt chart): tasks as bars over the days, with today marked. */
function Gantt() {
  const t0 = useMemo(() => today(), []);
  const [bars, setBars] = useKept<Bar[]>('uv-gantt', () => [
    { id: uid(), name: 'Research', start: t0, end: addD(t0, 6), done: 60 }, { id: uid(), name: 'First draft', start: addD(t0, 5), end: addD(t0, 14), done: 0 },
    { id: uid(), name: 'Feedback', start: addD(t0, 14), end: addD(t0, 18), done: 0 }, { id: uid(), name: 'Final version', start: addD(t0, 18), end: addD(t0, 24), done: 0 },
  ]);
  const svgRef = useRef<SVGSVGElement>(null);
  const ok = bars.filter((b) => b.start && b.end && b.end >= b.start);
  const from = ok.reduce((m, b) => (b.start < m ? b.start : m), ok[0]?.start ?? t0), to = ok.reduce((m, b) => (b.end > m ? b.end : m), ok[0]?.end ?? t0);
  const days = span(from, to) + 1, cell = Math.max(16, Math.min(40, 760 / days)), L = 150, W = L + days * cell + 16, H = 40 + ok.length * 36 + 10;
  const set = (id: string, p: Partial<Bar>) => setBars(bars.map((b) => (b.id === id ? { ...b, ...p } : b)));
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {bars.map((b, k) => (
          <div key={b.id} className="grid grid-cols-2 sm:grid-cols-[1fr_150px_150px_90px_auto] gap-2 items-end">
            <Field label={`Task ${k + 1}`}><input className="input" value={b.name} onChange={(e) => set(b.id, { name: e.target.value })} /></Field>
            <Field label="Starts"><input type="date" className="input" value={b.start} onChange={(e) => set(b.id, { start: e.target.value })} /></Field>
            <Field label="Ends"><input type="date" className="input" value={b.end} onChange={(e) => set(b.id, { end: e.target.value })} /></Field>
            <Field label="Done %"><input type="number" min={0} max={100} className="input" value={b.done} onChange={(e) => set(b.id, { done: Math.max(0, Math.min(100, +e.target.value || 0)) })} /></Field>
            <button type="button" onClick={() => setBars(bars.filter((x) => x.id !== b.id))} aria-label={`Remove ${b.name || 'task'}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => { const last = bars[bars.length - 1]?.end ?? t0; setBars([...bars, { id: uid(), name: 'New task', start: last, end: addD(last, 3), done: 0 }]); }}><Plus className="w-3.5 h-3.5" aria-hidden />Add a task</Btn>
          <Btn onClick={() => void savePng(svgRef.current, 'timeline.png')}><Download className="w-3.5 h-3.5" aria-hidden />Save picture</Btn>
        </div>
      </div>
      <div tabIndex={0} role="region" aria-label="Timeline picture (scrolls sideways)" className="relative rounded-2xl bg-white ring-1 ring-black/10 overflow-x-auto focus-visible:outline-2 focus-visible:outline-pink-500">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H} xmlns="http://www.w3.org/2000/svg" fontFamily="system-ui, sans-serif" role="img" aria-label={`Timeline from ${from} to ${to}`}>
          {Array.from({ length: days }, (_, d) => { const day = addD(from, d), dt = new Date(`${day}T12:00:00Z`), wk = dt.getUTCDay() === 0 || dt.getUTCDay() === 6; return (
            <g key={day}>
              {wk && <rect x={L + d * cell} y={28} width={cell} height={H - 28} fill="#f1f2f6" />}
              {(dt.getUTCDate() === 1 || d === 0 || (cell >= 24 ? true : dt.getUTCDay() === 1)) && <text x={L + d * cell + 2} y={18} fontSize={11} fill="#5b6077">{dt.getUTCDate() === 1 || d === 0 ? dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }) : dt.getUTCDate()}</text>}
            </g>
          ); })}
          {ok.map((b, k) => { const x = L + span(from, b.start) * cell, w = (span(b.start, b.end) + 1) * cell, y = 40 + k * 36, c = BRANCH[k % BRANCH.length]; return (
            <g key={b.id}>
              <text x={8} y={y + 17} fontSize={12} fontWeight={600} fill="#141320">{b.name.slice(0, 20)}</text>
              <motion.rect x={x} y={y} height={24} rx={8} fill={`${c}33`} stroke={c} initial={{ width: 0 }} animate={{ width: w }} transition={spring.smooth} />
              <motion.rect x={x} y={y} height={24} rx={8} fill={c} initial={{ width: 0 }} animate={{ width: (w * b.done) / 100 }} transition={spring.smooth} />
            </g>
          ); })}
          {t0 >= from && t0 <= to && <g><line x1={L + (span(from, t0) + 0.5) * cell} x2={L + (span(from, t0) + 0.5) * cell} y1={26} y2={H} stroke="#ec4899" strokeWidth={2} /><text x={L + (span(from, t0) + 0.5) * cell + 4} y={34} fontSize={10} fontWeight={700} fill="#be185d">Today</text></g>}
        </svg>
      </div>
    </div>
  );
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hue = (s: string) => { let h = 0; for (const ch of s.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
/** Weekly timetable: type a subject in each slot; same subject, same colour; print it. */
function Timetable() {
  const [t, setT] = useKept('uv-timetable', () => ({ sat: false, times: ['9:00', '10:00', '11:15', '12:15', '14:00', '15:00'], cells: {} as Record<string, string> }));
  const days = DAYS.slice(0, t.sat ? 6 : 5);
  const tint = (s: string) => (s.trim() ? `${BRANCH[hue(s.trim()) % BRANCH.length]}26` : undefined);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => setT({ ...t, times: [...t.times, ''] })}><Plus className="w-3.5 h-3.5" aria-hidden />Add a period</Btn>
        <Btn onClick={() => t.times.length > 1 && setT({ ...t, times: t.times.slice(0, -1) })}>Remove the last</Btn>
        <Btn on={t.sat} onClick={() => setT({ ...t, sat: !t.sat })}>Saturday</Btn>
        <Btn onClick={() => printOnly('timetable-sheet')}><Printer className="w-3.5 h-3.5" aria-hidden />Print</Btn>
        <Btn onClick={() => reset('Clear every slot?', () => setT({ ...t, cells: {} }))}><RotateCcw className="w-3.5 h-3.5" aria-hidden />Clear</Btn>
      </div>
      <div className="relative overflow-x-auto rounded-2xl ring-1 ring-black/10">
        <table id="timetable-sheet" className="w-full min-w-[640px] bg-white text-zinc-900 text-sm border-collapse">
          <thead><tr><th className="p-2 w-20 text-start text-xs text-[#4b5068]">Time</th>{days.map((d) => <th key={d} className="p-2 text-start font-bold">{d}</th>)}</tr></thead>
          <tbody>
            {t.times.map((time, r) => (
              <tr key={r} className="border-t border-zinc-200">
                <td className="p-1"><input aria-label={`Time of period ${r + 1}`} value={time} onChange={(e) => setT({ ...t, times: t.times.map((x, j) => (j === r ? e.target.value : x)) })} className="w-full bg-transparent px-1 py-2 text-xs font-mono tabular-nums text-[#4b5068] outline-none focus:bg-zinc-100 rounded" /></td>
                {days.map((d) => { const k = `${d}-${r}`, v = t.cells[k] ?? ''; return (
                  <td key={k} className="p-1"><input aria-label={`${d}, period ${r + 1}`} value={v} onChange={(e) => setT({ ...t, cells: { ...t.cells, [k]: e.target.value } })} style={{ background: tint(v) }} className="w-full rounded-lg px-2 py-2 font-semibold text-zinc-900 outline-none focus:ring-2 focus:ring-pink-500 transition-colors" placeholder="·" /></td>
                ); })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface Habit { id: string; name: string; days: string[] }
/** Habit tracker: tick each day; see the streak. */
function Habits() {
  const t0 = useMemo(() => today(), []);
  const [habits, setHabits] = useKept<Habit[]>('uv-habits', () => ['Read 20 minutes', 'Walk', 'Practise a language'].map((name) => ({ id: uid(), name, days: [] })));
  const [name, setName] = useState('');
  const N = 21, cols = Array.from({ length: N }, (_, k) => addD(t0, k - N + 1));
  const toggle = (h: Habit, d: string) => setHabits(habits.map((x) => (x.id === h.id ? { ...x, days: x.days.includes(d) ? x.days.filter((y) => y !== d) : [...x.days, d] } : x)));
  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) { setHabits([...habits, { id: uid(), name: name.trim(), days: [] }]); setName(''); } }} className="flex gap-2">
        <input className="input flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="A new habit, like “Drink water”" aria-label="New habit" />
        <button type="submit" className="btn-primary btn-sm"><Plus className="w-4 h-4" aria-hidden />Add</button>
      </form>
      <div className="relative overflow-x-auto">
        <table className="text-sm border-separate border-spacing-1">
          <thead><tr><th className="text-start text-xs text-zinc-600 dark:text-zinc-300 pe-2">Habit</th>{cols.map((d) => <th key={d} className="text-[11px] font-mono tabular-nums text-zinc-600 dark:text-zinc-300 w-6">{+d.slice(8)}</th>)}<th className="text-xs text-zinc-600 dark:text-zinc-300 ps-2">Streak</th><th><span className="sr-only">Remove</span></th></tr></thead>
          <tbody>
            {habits.map((h) => { const s = streaks(h.days, t0); return (
              <tr key={h.id}>
                <td className="pe-2 font-semibold text-zinc-900 dark:text-white whitespace-nowrap max-w-[180px] truncate" translate="no">{h.name}</td>
                {cols.map((d) => { const on = h.days.includes(d); return (
                  <td key={d}><button type="button" onClick={() => toggle(h, d)} aria-pressed={on} aria-label={`${h.name}, ${d}`} className={cn('w-6 h-6 rounded-md transition-[background-color,transform] duration-150 active:scale-75', on ? 'bg-pink-500' : 'bg-zinc-200 dark:bg-white/10 hover:bg-zinc-300 dark:hover:bg-white/20', d === t0 && 'ring-2 ring-pink-500/50')} /></td>
                ); })}
                <td className="ps-2 font-mono tabular-nums text-zinc-900 dark:text-white whitespace-nowrap">{s.cur} <span className="text-xs text-zinc-600 dark:text-zinc-300">best {s.best}</span></td>
                <td><button type="button" onClick={() => setHabits(habits.filter((x) => x.id !== h.id))} aria-label={`Remove ${h.name}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button></td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">The last three weeks, today on the end. Kept on this device.</p>
    </div>
  );
}

/** Decision helper: score each choice on what matters, weighted. */
function Decide() {
  const [d, setD] = useKept('uv-decide', () => ({ options: ['Option A', 'Option B', 'Option C'], criteria: [{ name: 'Cost', w: 3 }, { name: 'Time', w: 2 }, { name: 'Fun', w: 1 }], scores: [[3, 3, 3], [3, 3, 3], [3, 3, 3]] as number[][] }));
  const ranked = decide(d.options, d.criteria.map((c) => c.w), d.scores);
  const setScore = (o: number, c: number, v: number) => setD({ ...d, scores: d.options.map((_, i) => d.criteria.map((__, j) => (i === o && j === c ? v : d.scores[i]?.[j] ?? 3))) });
  return (
    <div className="space-y-4">
      <div className="relative overflow-x-auto">
        <table className="text-sm min-w-[480px] w-full">
          <thead>
            <tr><th className="text-start p-1 text-xs text-zinc-600 dark:text-zinc-300">Choice ↓ / matters →</th>
              {d.criteria.map((c, j) => (
                <th key={j} className="p-1 align-bottom">
                  <input aria-label={`What matters ${j + 1}`} className="input py-1 text-sm font-bold" value={c.name} onChange={(e) => setD({ ...d, criteria: d.criteria.map((x, k) => (k === j ? { ...x, name: e.target.value } : x)) })} />
                  <label className="mt-1 flex items-center gap-1 text-[11px] font-normal text-zinc-600 dark:text-zinc-300">Weight<input type="range" min={1} max={5} value={c.w} onChange={(e) => setD({ ...d, criteria: d.criteria.map((x, k) => (k === j ? { ...x, w: +e.target.value } : x)) })} className="accent-pink-500 w-16" /><span className="tabular-nums">{c.w}</span></label>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.options.map((o, i) => (
              <tr key={i}>
                <td className="p-1"><input aria-label={`Choice ${i + 1}`} className="input py-1 font-semibold" value={o} onChange={(e) => setD({ ...d, options: d.options.map((x, k) => (k === i ? e.target.value : x)) })} /></td>
                {d.criteria.map((c, j) => (
                  <td key={j} className="p-1"><select aria-label={`${o}: ${c.name}`} className="input py-1" value={d.scores[i]?.[j] ?? 3} onChange={(e) => setScore(i, j, +e.target.value)}>{[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v} {['', 'poor', 'weak', 'fair', 'good', 'great'][v]}</option>)}</select></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => setD({ ...d, options: [...d.options, `Option ${String.fromCharCode(65 + d.options.length)}`], scores: [...d.scores, d.criteria.map(() => 3)] })}><Plus className="w-3.5 h-3.5" aria-hidden />Choice</Btn>
        <Btn onClick={() => setD({ ...d, criteria: [...d.criteria, { name: 'New', w: 1 }], scores: d.scores.map((r) => [...r, 3]) })}><Plus className="w-3.5 h-3.5" aria-hidden />What matters</Btn>
        {d.options.length > 2 && <Btn onClick={() => setD({ ...d, options: d.options.slice(0, -1), scores: d.scores.slice(0, -1) })}>Remove the last choice</Btn>}
        {d.criteria.length > 1 && <Btn onClick={() => setD({ ...d, criteria: d.criteria.slice(0, -1), scores: d.scores.map((r) => r.slice(0, -1)) })}>Remove the last “matters”</Btn>}
      </div>
      <ol className="space-y-2" aria-label="Ranking">
        {ranked.map((r, k) => (
          <motion.li key={r.name + k} layout transition={spring.smooth} className="flex items-center gap-3">
            <span className="w-28 truncate font-semibold text-zinc-900 dark:text-white">{k === 0 ? '★ ' : ''}{r.name}</span>
            <span className="flex-1 h-3 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><motion.span className={cn('block h-full rounded-full', k === 0 ? 'bg-pink-500' : 'bg-indigo-400 dark:bg-aqua-300/70')} initial={false} animate={{ width: `${(r.score / 5) * 100}%` }} transition={spring.smooth} /></span>
            <span className="w-10 text-end font-mono tabular-nums text-zinc-900 dark:text-white">{r.score.toFixed(1)}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

/** Flowchart from text: one step per arrow, "A -> B: label". */
function Flow() {
  const [t, setT] = useKept('uv-flow', 'Idea -> Plan -> Build -> Test\nTest -> Share: works\nTest -> Build: fix it');
  const [down, setDown] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const f = useMemo(() => flow(t), [t]);
  const BW = 140, BH = 44, GX = down ? 40 : 70, GY = down ? 70 : 30;
  const at = (id: string) => { const n = f.nodes.find((x) => x.id === id)!; return down ? { x: 20 + n.order * (BW + GX), y: 20 + n.layer * (BH + GY) } : { x: 20 + n.layer * (BW + GX), y: 20 + n.order * (BH + GY) }; };
  const W = 40 + (down ? f.rows : f.layers) * (BW + GX), H = 60 + (down ? f.layers : f.rows) * (BH + GY);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          <Field label="Steps, one arrow a line"><textarea className={cn(area, 'min-h-[220px]')} value={t} onChange={(e) => setT(e.target.value)} /></Field>
          <p className="text-xs text-zinc-600 dark:text-zinc-300"><code>A -&gt; B</code> joins two steps; add <code>: label</code> to name the arrow.</p>
          <div className="flex flex-wrap gap-2"><Btn on={!down} onClick={() => setDown(false)}>Left to right</Btn><Btn on={down} onClick={() => setDown(true)}>Top to bottom</Btn><Btn onClick={() => void savePng(svgRef.current, 'flowchart.png')}><Download className="w-3.5 h-3.5" aria-hidden />Save picture</Btn></div>
        </div>
        <div tabIndex={0} role="region" aria-label="Flowchart picture" className="relative rounded-2xl bg-white ring-1 ring-black/10 overflow-auto max-h-[560px] focus-visible:outline-2 focus-visible:outline-pink-500">
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H} xmlns="http://www.w3.org/2000/svg" fontFamily="system-ui, sans-serif" role="img" aria-label={`Flowchart with ${f.nodes.length} steps`}>
            <defs><marker id="fl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#5b6077" /></marker></defs>
            {f.edges.map((e, k) => {
              const a = at(e.from), b = at(e.to), backward = down ? b.y <= a.y : b.x <= a.x;
              const [x1, y1, x2, y2] = down ? [a.x + BW / 2, a.y + BH, b.x + BW / 2, b.y] : [a.x + BW, a.y + BH / 2, b.x, b.y + BH / 2];
              const d = backward
                ? (down ? `M${a.x + BW},${a.y + BH / 2} C${a.x + BW + 50},${a.y + BH / 2} ${b.x + BW + 50},${b.y + BH / 2} ${b.x + BW},${b.y + BH / 2}` : `M${a.x + BW / 2},${a.y + BH} C${a.x + BW / 2},${a.y + BH + 50} ${b.x + BW / 2},${b.y + BH + 50} ${b.x + BW / 2},${b.y + BH}`)
                : `M${x1},${y1} C${down ? x1 : (x1 + x2) / 2},${down ? (y1 + y2) / 2 : y1} ${down ? x2 : (x1 + x2) / 2},${down ? (y1 + y2) / 2 : y2} ${x2},${y2}`;
              const lx = backward ? (down ? Math.max(a.x, b.x) + BW + 40 : (a.x + b.x) / 2 + BW / 2) : (x1 + x2) / 2, ly = backward ? (down ? (a.y + b.y) / 2 + BH / 2 : Math.max(a.y, b.y) + BH + 44) : (y1 + y2) / 2 - 6;
              return <g key={k}><motion.path initial={false} animate={{ d }} transition={spring.smooth} fill="none" stroke="#5b6077" strokeWidth={2} markerEnd="url(#fl-arrow)" />{e.label && <text x={lx} y={ly} textAnchor="middle" fontSize={11} fontWeight={600} fill="#be185d" paintOrder="stroke" stroke="#fff" strokeWidth={4}>{e.label}</text>}</g>;
            })}
            {f.nodes.map((n, k) => { const p = at(n.id), first = k === 0, end = !f.edges.some((e) => e.from === n.id); return (
              <motion.g key={n.id} initial={false} animate={{ x: p.x, y: p.y }} transition={spring.smooth}>
                <rect width={BW} height={BH} rx={first || end ? BH / 2 : 10} fill={first ? '#171f44' : end ? '#fbcfe8' : '#eef0ff'} stroke={first ? '#171f44' : end ? '#ec4899' : '#533ff6'} strokeWidth={1.5} />
                <text x={BW / 2} y={BH / 2 + 4.5} textAnchor="middle" fontSize={13} fontWeight={600} fill={first ? '#ffffff' : '#141320'}>{n.id.length > 18 ? `${n.id.slice(0, 17)}…` : n.id}</text>
              </motion.g>
            ); })}
          </svg>
        </div>
      </div>
    </div>
  );
}
