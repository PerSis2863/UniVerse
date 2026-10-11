import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { DELETE, INSERT, resolveSuggestions, suggestKey, suggestPlugin, suggestionsIn } from './suggest-mode';

const markSpec = { attrs: { id: { default: '' }, userId: { default: '' }, name: { default: '' }, at: { default: 0 } }, inclusive: false };
const schema = new Schema({
  nodes: { doc: { content: 'paragraph+' }, paragraph: { content: 'text*' }, text: {} },
  marks: { [INSERT]: markSpec, [DELETE]: markSpec },
});
const asha = { id: 'u1', name: 'Asha' };

function start(...paras: string[]) {
  const doc = schema.node('doc', null, paras.map((p) => schema.node('paragraph', null, p ? [schema.text(p)] : [])));
  let state = EditorState.create({ doc, plugins: [suggestPlugin(() => asha)] });
  state = state.apply(state.tr.setMeta(suggestKey, { on: true }));
  return state;
}
const at = (s: EditorState, pos: number) => s.apply(s.tr.setSelection(TextSelection.create(s.doc, pos)));
/** The text with additions as [+…] and removals as [-…]. */
const show = (s: EditorState) => {
  let out = '';
  s.doc.forEach((p, _o, i) => {
    if (i) out += ' / ';
    p.forEach((t) => { const m = t.marks.map((x) => x.type.name); out += m.includes(INSERT) ? `[+${t.text}]` : m.includes(DELETE) ? `[-${t.text}]` : t.text; });
  });
  return out;
};

describe('suggestions mode', () => {
  it('marks typing as added and keeps deleted text, struck', () => {
    let s = at(start('Hello world'), 7);
    s = s.apply(s.tr.insertText('big '));
    expect(show(s)).toBe('Hello [+big ]world');
    s = at(s, 16); // end
    s = s.apply(s.tr.delete(15, 16)); // backspace "d"
    s = s.apply(s.tr.delete(s.selection.from - 1, s.selection.from)); // and "l"
    expect(show(s)).toBe('Hello [+big ]wor[-ld]');
    expect(s.selection.from).toBe(14); // before what was removed
    const list = suggestionsIn(s.doc);
    expect(list.map((x) => [x.kind, x.text, x.name])).toEqual([['insert', 'big ', 'Asha'], ['delete', 'ld', 'Asha']]);
  });
  it('takes away its own additions when they are deleted', () => {
    let s = at(start('Hi'), 3);
    s = s.apply(s.tr.insertText(' there'));
    expect(show(s)).toBe('Hi[+ there]');
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, 3, 9)));
    s = s.apply(s.tr.deleteSelection());
    expect(show(s)).toBe('Hi');
    expect(suggestionsIn(s.doc)).toEqual([]);
  });
  it('typing over a selection removes it and adds the new text after', () => {
    let s = start('Hello world');
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, 7, 12)));
    s = s.apply(s.tr.insertText('there'));
    expect(show(s)).toBe('Hello [-world][+there]');
    expect(s.selection.from).toBe(17); // after the new text
  });
  it('accepts and rejects', () => {
    let s = start('Hello world');
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, 7, 12)));
    s = s.apply(s.tr.insertText('there'));
    const accepted = s.apply(resolveSuggestions(s, suggestionsIn(s.doc), true));
    expect(show(accepted)).toBe('Hello there');
    const rejected = s.apply(resolveSuggestions(s, suggestionsIn(s.doc), false));
    expect(show(rejected)).toBe('Hello world');
    // One at a time: accept the removal only.
    const one = s.apply(resolveSuggestions(s, suggestionsIn(s.doc).filter((x) => x.kind === 'delete'), true));
    expect(show(one)).toBe('Hello [+there]');
  });
  it('does nothing when off, or for other people’s changes', () => {
    let s = start('Hi');
    s = s.apply(s.tr.setMeta(suggestKey, { on: false }));
    s = s.apply(s.tr.insertText('!', 3));
    expect(show(s)).toBe('Hi!');
    s = s.apply(s.tr.setMeta(suggestKey, { on: true }));
    s = s.apply(s.tr.insertText('?', 4).setMeta('y-sync$', {}));
    expect(show(s)).toBe('Hi!?');
  });
  it('keeps paragraphs apart when the break between them is deleted', () => {
    let s = at(start('One', 'Two'), 6);
    s = s.apply(s.tr.delete(4, 6)); // backspace at the start of "Two" joins them
    expect(show(s)).toBe('One / Two');
  });
});
