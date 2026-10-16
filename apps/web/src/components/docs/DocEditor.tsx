'use client';

import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { TableKit } from '@tiptap/extension-table';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Image from '@tiptap/extension-image';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { authedJson } from '@/lib/authed-fetch';
import { colorFor, useLiveDoc, type DocStatus } from '@/lib/use-live-doc';
import { createMentionStore, docMention, MentionMenu } from './DocMentions';
import { DocEmbed } from './DocEmbed';
import { SuggestionDelete, SuggestionInsert, Suggestions } from './suggestions-ext';
import { FindReplace, PageBreak, ParagraphFormat, Subscript, Superscript, TableOfContents, TextStyle } from './word-ext';

/** Word's formatting (Office suite · O3): also used by the history's read-only view, so a version
 *  shows the same. */
export const WORD_EXTENSIONS = [TextStyle, Subscript, Superscript, ParagraphFormat, PageBreak, TableOfContents];

export { DocToolbar } from './DocToolbar';
export type { DocStatus };

// The document editor (Stage 4 · 3.2): Tiptap on a Yjs document synced with the doc's room
// (src/lib/use-live-doc.ts; it keeps a copy on this device for working offline, Stage 5 · B9.7).
// Everyone's caret shows with their name. While you write, a version is saved now and then
// (src/server/docs.ts keeps at most one every 2 minutes).

export function DocEditor({ docId, me, canEdit: mayEdit, onStatus, onPeers, onEditor, onPresence, onYdoc }: {
  docId: string; me: { id: string; name: string };
  /** Whether I may edit, from the document's details (used offline until a ticket says). */
  canEdit: boolean;
  onStatus: (s: DocStatus, canEdit: boolean) => void;
  onPeers: (names: string[]) => void;
  /** Who else is here, with their cursor colour (3.8). */
  onPresence?: (people: { name: string; color: string }[]) => void;
  onEditor: (e: Editor | null) => void;
  /** The live document (its "page" map holds the page setup). */
  onYdoc?: (d: Y.Doc) => void;
}) {
  const [ydoc] = useState(() => new Y.Doc());
  const [awareness] = useState(() => new Awareness(ydoc));
  // @mentions in the text: the suggestion menu's state (DocMentions.tsx).
  const [mentions] = useState(() => createMentionStore());
  const callbacks = useRef({ onEditor });
  useEffect(() => { callbacks.current = { onEditor }; });
  const color = colorFor(me.id);

  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [
      StarterKit.configure({ undoRedo: false, link: { openOnClick: false, autolink: true } }),
      Collaboration.configure({ document: ydoc, field: 'doc' }),
      CollaborationCaret.configure({ provider: { awareness }, user: { name: me.name, color } }),
      TableKit.configure({ table: { resizable: true } }),
      TaskList, TaskItem.configure({ nested: true }),
      Image,
      DocEmbed,
      SuggestionInsert, SuggestionDelete, Suggestions.configure({ user: me }),
      ...WORD_EXTENSIONS, FindReplace, CharacterCount,
      docMention(docId, mentions),
      Placeholder.configure({ placeholder: 'Start writing…  Use the toolbar, or type # for a heading, - for a list, [] for a checklist, @ to mention someone.' }),
    ],
    editorProps: {
      attributes: { class: 'doc-prose focus:outline-none min-h-[60vh] px-6 sm:px-12 py-10', 'aria-label': 'Document text', 'aria-multiline': 'true', spellcheck: 'true' },
      // Links open with a click when reading, or Ctrl / ⌘ + click while writing (pages in the
      // same tab, other sites in a new one; Stage 5 · B9.2).
      handleClick: (view, _pos, event) => {
        const a = (event.target as HTMLElement | null)?.closest?.('a[href]');
        if (!a || (view.editable && !event.metaKey && !event.ctrlKey)) return false;
        const href = a.getAttribute('href') ?? '';
        if (href.startsWith('/')) window.location.assign(href);
        else if (/^(https?:|mailto:)/i.test(href)) window.open(href, '_blank', 'noopener,noreferrer');
        return true;
      },
    },
  }, [ydoc]);

  useEffect(() => { callbacks.current.onEditor(editor); return () => callbacks.current.onEditor(null); }, [editor]);
  const onYdocRef = useRef(onYdoc);
  useEffect(() => { onYdocRef.current = onYdoc; });
  useEffect(() => { onYdocRef.current?.(ydoc); }, [ydoc]);

  // The live connection, and the copy on this device (src/lib/use-live-doc.ts).
  useLiveDoc({ docId, ydoc, awareness, mayEdit, onStatus, onPeers, onPresence });

  // Versions: a few seconds after I stop typing (the server keeps one every 2 minutes at most),
  // and when I leave.
  useEffect(() => {
    if (!editor) return;
    let t: ReturnType<typeof setTimeout> | null = null, dirty = false;
    const save = () => {
      if (!dirty || !editor.isEditable) return;
      dirty = false;
      void authedJson(`/api/docs/${docId}/versions`, { method: 'POST', keepalive: true, body: JSON.stringify({ html: editor.getHTML(), text: editor.getText().slice(0, 300) }) }).catch(() => {});
    };
    const onUpdate = ({ transaction }: { transaction: { getMeta: (k: string) => unknown } }) => {
      if (transaction.getMeta('y-sync$')) return; // someone else's change
      dirty = true;
      if (t) clearTimeout(t);
      t = setTimeout(save, 8000);
    };
    editor.on('update', onUpdate);
    window.addEventListener('pagehide', save);
    return () => { editor.off('update', onUpdate); window.removeEventListener('pagehide', save); if (t) clearTimeout(t); save(); };
  }, [editor, docId]);

  return <><EditorContent editor={editor} /><MentionMenu store={mentions} /></>;
}
