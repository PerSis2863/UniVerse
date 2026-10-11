import { Extension, Mark } from '@tiptap/react';
import { DELETE, INSERT, suggestPlugin, type SuggestUser } from '@/lib/suggest-mode';

// The Tiptap side of suggestions mode (Stage 5 · B9.3; the logic is src/lib/suggest-mode.ts):
// two marks, shown as <ins> and <del> with who suggested it and when, and the plugin.

const attrs = () => ({
  id: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-suggestion') ?? '', renderHTML: (a: Record<string, unknown>) => ({ 'data-suggestion': a.id }) },
  userId: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-user') ?? '', renderHTML: (a: Record<string, unknown>) => ({ 'data-user': a.userId }) },
  name: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-name') ?? '', renderHTML: (a: Record<string, unknown>) => ({ 'data-name': a.name, title: `Suggested by ${a.name}` }) },
  at: { default: 0, parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-at')) || 0, renderHTML: (a: Record<string, unknown>) => ({ 'data-at': a.at }) },
});

export const SuggestionInsert = Mark.create({
  name: INSERT,
  inclusive: false,
  addAttributes: attrs,
  parseHTML: () => [{ tag: 'ins[data-suggestion]' }],
  renderHTML: ({ HTMLAttributes }) => ['ins', { ...HTMLAttributes, class: 'doc-suggest-ins' }, 0],
});

export const SuggestionDelete = Mark.create({
  name: DELETE,
  inclusive: false,
  addAttributes: attrs,
  parseHTML: () => [{ tag: 'del[data-suggestion]' }],
  renderHTML: ({ HTMLAttributes }) => ['del', { ...HTMLAttributes, class: 'doc-suggest-del' }, 0],
});

/** The plugin, for the person at this editor. */
export const Suggestions = Extension.create<{ user: SuggestUser }>({
  name: 'suggestions',
  addOptions: () => ({ user: { id: '', name: 'Someone' } }),
  addProseMirrorPlugins() { return [suggestPlugin(() => this.options.user)]; },
});
