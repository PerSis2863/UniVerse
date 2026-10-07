'use client';

import { useSyncExternalStore } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import Mention from '@tiptap/extension-mention';
import type { Editor } from '@tiptap/react';
import { Avatar } from '@/components/chat/MessageBubble';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// @mentions inside a document's text (Stage 4 · 3.9 follow-up): typing "@" suggests the people who
// can see the document (/api/mentions?kind=doc); picking one puts a mention chip in the text (synced
// like any edit) and notifies them once (POST /api/docs/:id/mention, src/server/docs.ts mentionInDoc).
// The suggestion menu is ours (no popup library): Tiptap's suggestion plugin feeds a small store, and
// MentionMenu draws it under the caret.

export type Person = { id: string; name: string; avatar: string | null };
interface MenuState { open: boolean; items: Person[]; index: number; rect: { left: number; top: number; bottom: number } | null; pick: ((p: Person) => void) | null }
const CLOSED: MenuState = { open: false, items: [], index: 0, rect: null, pick: null };

export function createMentionStore() {
  let state = CLOSED;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set: (next: Partial<MenuState>) => { state = { ...state, ...next }; subs.forEach((f) => f()); },
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  };
}
export type MentionStore = ReturnType<typeof createMentionStore>;

const matches = (p: Person, q: string) => !q || p.name.toLowerCase().startsWith(q) || p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q));

/** The mention extension for one document. */
export function docMention(docId: string, store: MentionStore) {
  let people: Promise<Person[]> | null = null;
  const load = () => (people ??= authedJson<{ people: Person[] }>(`/api/mentions?kind=doc&id=${encodeURIComponent(docId)}`).then((r) => r.people).catch(() => { people = null; return []; }));
  const notifyPicked = (editor: Editor, p: Person) => {
    // The sentence around it tells them why (the paragraph, as it reads now).
    const context = editor.state.selection.$from.parent.textContent.slice(0, 200);
    void authedJson(`/api/docs/${docId}/mention`, { method: 'POST', body: JSON.stringify({ userId: p.id, context }) }).catch(() => {});
  };
  return Mention.configure({
    HTMLAttributes: { class: 'doc-mention' },
    renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
    suggestion: {
      char: '@',
      items: async ({ query }) => (await load()).filter((p) => matches(p, query.toLowerCase())).slice(0, 6),
      render: () => {
        const place = (r: DOMRect | null | undefined) => (r ? { left: r.left, top: r.top, bottom: r.bottom } : null);
        type Props = { editor: Editor; items: Person[]; clientRect?: (() => DOMRect | null) | null; command: (attrs: { id: string; label: string }) => void };
        const open = (props: Props) => {
          // The editor is kept here: inserting the mention ends the suggestion (onExit) before we notify.
          const editor = props.editor;
          store.set({
            open: true, items: props.items, index: Math.min(store.get().index, Math.max(0, props.items.length - 1)), rect: place(props.clientRect?.()),
            pick: (p) => { props.command({ id: p.id, label: p.name }); notifyPicked(editor, p); store.set(CLOSED); },
          });
        };
        return {
          onStart: (props: Props) => { store.set({ index: 0 }); open(props); },
          onUpdate: (props: Props) => open(props),
          onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            const s = store.get();
            if (!s.open || !s.items.length) return false;
            if (event.key === 'ArrowDown') { store.set({ index: (s.index + 1) % s.items.length }); return true; }
            if (event.key === 'ArrowUp') { store.set({ index: (s.index - 1 + s.items.length) % s.items.length }); return true; }
            if (event.key === 'Enter' || event.key === 'Tab') { s.pick?.(s.items[s.index]); return true; }
            if (event.key === 'Escape') { store.set(CLOSED); return true; }
            return false;
          },
          onExit: () => store.set(CLOSED),
        };
      },
    },
  });
}

/** The suggestion menu, under the caret. */
export function MentionMenu({ store }: { store: MentionStore }) {
  const s = useSyncExternalStore(store.subscribe, store.get, () => CLOSED);
  const show = s.open && !!s.rect && s.items.length > 0;
  return (
    <AnimatePresence>
      {show && s.rect && (
        <motion.ul key="mentions" role="listbox" aria-label="Mention someone" initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={spring.snappy}
          style={{ position: 'fixed', left: Math.min(s.rect.left, (typeof window === 'undefined' ? 9999 : window.innerWidth) - 272), top: s.rect.bottom + 6 }}
          className="z-[200] w-64 py-1 rounded-xl bg-white dark:bg-[#121830] border border-zinc-200 dark:border-white/10 shadow-2xl">
          {s.items.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === s.index}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); s.pick?.(p); }} onMouseEnter={() => store.set({ index: i })}
                className={cn('relative w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-sm', i !== s.index && 'hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>
                {i === s.index && <motion.span layoutId="doc-mention-active" transition={spring.snappy} className="absolute inset-x-1 inset-y-0 rounded-lg bg-indigo-500/10" aria-hidden />}
                <Avatar name={p.name} src={p.avatar} size={22} />
                <span className="relative truncate text-zinc-800 dark:text-zinc-100">{p.name}</span>
              </button>
            </li>
          ))}
          <li className="px-2.5 pt-1 pb-0.5 text-[10px] text-zinc-400">They’ll get a notification</li>
        </motion.ul>
      )}
    </AnimatePresence>
  );
}
