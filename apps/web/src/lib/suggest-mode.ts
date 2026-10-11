import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { ReplaceStep } from '@tiptap/pm/transform';
import type { Mark, MarkType, Node as PMNode, Slice } from '@tiptap/pm/model';

// Suggestions mode in docs (Stage 5 · B9.3), like "track changes": while someone is suggesting,
// what they type is marked as added and what they delete stays, struck through, marked as removed.
// Anyone who can edit then accepts or rejects each suggestion. Marks: "suggestionInsert" and
// "suggestionDelete" with { id, userId, name, at }. Turning suggesting on is per person (this
// editor only); the marks sync to everyone like any edit.

export const INSERT = 'suggestionInsert', DELETE = 'suggestionDelete';
export interface SuggestUser { id: string; name: string }
export interface SuggestState { on: boolean }
export const suggestKey = new PluginKey<SuggestState>('suggest');

let seq = 0;
const newId = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`;

interface Change { from: number; insertedTo: number; deleted: Slice; backspace: boolean; forward: boolean }

/** A suggestion mark by this person next to a position, to carry on the same suggestion. */
function neighbour(doc: PMNode, pos: number, type: MarkType, user: SuggestUser): Mark | null {
  const $p = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (const n of [$p.nodeBefore, $p.nodeAfter]) {
    const m = n?.marks.find((x) => x.type === type && x.attrs.userId === user.id);
    if (m) return m;
  }
  return null;
}

/** Turns one plain edit into a suggested one (or nothing, when it isn't a plain edit). */
function suggest(tr: Transaction, oldState: EditorState, newState: EditorState, user: SuggestUser): Transaction | null {
  const ins = newState.schema.marks[INSERT], del = newState.schema.marks[DELETE];
  if (!ins || !del || !tr.steps.length || !tr.steps.every((s) => s instanceof ReplaceStep)) return null;
  const changes: Change[] = [];
  tr.steps.forEach((s, i) => {
    const step = s as ReplaceStep & { from: number; to: number; slice: Slice };
    const rest = tr.mapping.slice(i + 1);
    const deleted = tr.docs[i].slice(step.from, step.to);
    const from = rest.map(step.from, -1), insertedTo = rest.map(step.from + step.slice.size, 1);
    const sel = oldState.selection;
    changes.push({ from, insertedTo, deleted, backspace: tr.steps.length === 1 && sel.empty && sel.head === step.to, forward: tr.steps.length === 1 && sel.empty && sel.head === step.from });
  });
  const at = Date.now();
  const out = newState.tr;
  let cursor: number | null = null;
  // From the end, so each change leaves the positions of the earlier ones alone.
  for (const c of changes.sort((a, b) => b.from - a.from)) {
    // What was typed or pasted: marked as added (never as removed).
    if (c.insertedTo > c.from) {
      out.removeMark(c.from, c.insertedTo, del);
      out.addMark(c.from, c.insertedTo, neighbour(out.doc, c.from, ins, user) ?? neighbour(out.doc, c.insertedTo, ins, user) ?? ins.create({ id: newId(), userId: user.id, name: user.name, at }));
    }
    if (!c.deleted.size) continue;
    // What was deleted goes back in, before anything typed in its place, marked as removed.
    const before = out.doc.content.size;
    out.replace(c.from, c.from, c.deleted);
    const end = c.from + (out.doc.content.size - before);
    out.addMark(c.from, end, neighbour(out.doc, c.from, del, user) ?? neighbour(out.doc, end, del, user) ?? del.create({ id: newId(), userId: user.id, name: user.name, at }));
    // Deleting something that was only suggested as added takes it away for real.
    const added: [number, number][] = [];
    out.doc.nodesBetween(c.from, end, (n, pos) => { if (n.isText && n.marks.some((m) => m.type === ins)) added.push([Math.max(pos, c.from), Math.min(pos + n.nodeSize, end)]); });
    let removed = 0;
    for (const [a, b] of added.reverse()) { out.delete(a, b); removed += b - a; }
    if (changes.length === 1 && c.insertedTo === c.from) cursor = c.backspace ? c.from : c.forward ? end - removed : end - removed;
  }
  if (!out.docChanged) return null;
  if (cursor !== null) out.setSelection(TextSelection.create(out.doc, Math.max(0, Math.min(cursor, out.doc.content.size))));
  return out.setMeta(suggestKey, { on: true }).setMeta('addToHistory', tr.getMeta('addToHistory') ?? true);
}

/** The ProseMirror plugin: keeps whether suggesting is on, and turns edits into suggestions. */
export function suggestPlugin(user: () => SuggestUser) {
  return new Plugin<SuggestState>({
    key: suggestKey,
    state: {
      init: () => ({ on: false }),
      apply: (tr, value) => {
        const meta = tr.getMeta(suggestKey) as Partial<SuggestState> | undefined;
        return meta && typeof meta.on === 'boolean' ? { on: meta.on } : value;
      },
    },
    appendTransaction(trs, oldState, newState) {
      if (!suggestKey.getState(newState)?.on) return null;
      const edits = trs.filter((t) => t.docChanged);
      // One plain edit by this person (not someone else's change, not an accept / reject).
      if (edits.length !== 1 || edits[0].getMeta('y-sync$') || edits[0].getMeta(suggestKey) || edits[0].getMeta('suggest-skip')) return null;
      return suggest(edits[0], oldState, newState, user());
    },
  });
}

// ── Reviewing ────────────────────────────────────────────────────────────────────────────────

export interface Suggestion { id: string; kind: 'insert' | 'delete'; text: string; ranges: [number, number][]; userId: string; name: string; at: number }

/** Every suggestion in the document, in order. */
export function suggestionsIn(doc: PMNode): Suggestion[] {
  const map = new Map<string, Suggestion>();
  doc.descendants((n, pos) => {
    if (!n.isText) return;
    for (const m of n.marks as readonly Mark[]) {
      const kind = m.type.name === INSERT ? 'insert' : m.type.name === DELETE ? 'delete' : null;
      if (!kind) continue;
      const key = `${kind}:${m.attrs.id}`;
      const s = map.get(key) ?? { id: String(m.attrs.id), kind, text: '', ranges: [], userId: String(m.attrs.userId ?? ''), name: String(m.attrs.name ?? 'Someone'), at: Number(m.attrs.at) || 0 };
      const last = s.ranges[s.ranges.length - 1];
      if (last && last[1] === pos) last[1] = pos + n.nodeSize; else s.ranges.push([pos, pos + n.nodeSize]);
      s.text += n.text ?? '';
      map.set(key, s);
    }
  });
  return [...map.values()].sort((a, b) => a.ranges[0][0] - b.ranges[0][0]);
}

/** Accepts or rejects suggestions (the change isn't itself tracked as a suggestion). */
export function resolveSuggestions(state: EditorState, list: Suggestion[], accept: boolean): Transaction {
  const tr = state.tr.setMeta('suggest-skip', true);
  const ins = state.schema.marks[INSERT], del = state.schema.marks[DELETE];
  // Text to take away, and marks to take off; from the end so positions hold.
  const drop: [number, number][] = [], unmark: { range: [number, number]; type: MarkType }[] = [];
  for (const s of list) {
    const goes = (s.kind === 'insert') !== accept; // a rejected addition or an accepted removal
    for (const r of s.ranges) {
      if (goes) drop.push(r); else unmark.push({ range: r, type: s.kind === 'insert' ? ins : del });
    }
  }
  for (const u of unmark) tr.removeMark(u.range[0], u.range[1], u.type);
  for (const [a, b] of drop.sort((x, y) => y[0] - x[0])) tr.delete(a, b);
  return tr;
}
