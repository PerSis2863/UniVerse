import { describe, expect, it } from 'vitest';
import { checklistDone, dateGroup, daysLeft, joinNote, linesOf, noteTitle, notePreview, noteToHtml, parseNote, rowTime, tickedDown } from './quick-notes';

// Quick notes (M90): notes stay plain text, so old notes and saved copies open unchanged.
describe('quick notes text', () => {
  it('reads a title, paragraphs and tick boxes, and writes them back the same', () => {
    const text = 'Shopping\nfor the weekend\n[ ] milk\n[x] bread\n';
    const { title, lines } = parseNote(text);
    expect(title).toBe('Shopping');
    expect(lines).toEqual([{ text: 'for the weekend', check: null }, { text: 'milk', check: false }, { text: 'bread', check: true }, { text: '', check: null }]);
    expect(joinNote(title, lines)).toBe(text);
    expect(checklistDone(text)).toBe('1/2');
    expect(checklistDone('Just words')).toBeNull();
  });
  it('titles and previews like the list shows them', () => {
    expect(noteTitle({ text: '' })).toBe('New note');
    expect(noteTitle({ text: '[ ] call mum\nlater' })).toBe('call mum'); // an old note that began with a tick box
    expect(notePreview({ text: 'Title\n\n[ ] first thing  ' })).toBe('first thing');
    expect(linesOf('a\n[x] b')).toEqual([{ text: 'a', check: null }, { text: 'b', check: true }]);
  });
  it('groups by date as Apple Notes does, and counts down Recently deleted', () => {
    const now = new Date(2026, 10, 4, 15, 0).getTime(), day = 86_400_000;
    expect(dateGroup(now - 60_000, now)).toBe('Today');
    expect(dateGroup(now - day, now)).toBe('Yesterday');
    expect(dateGroup(now - 3 * day, now)).toBe('Previous 7 days');
    expect(dateGroup(now - 20 * day, now)).toBe('Previous 30 days');
    expect(dateGroup(new Date(2025, 2, 1).getTime(), now)).toBe('2025');
    expect(rowTime(now - day, now)).toBe('Yesterday');
    expect(daysLeft(now - 29.5 * day, now)).toBe(1);
    expect(daysLeft(now - 31 * day, now)).toBe(0);
  });
  it('moves ticked items down within each checklist, and becomes a document with a real checklist', () => {
    const { lines } = parseNote('T\n[x] a\n[ ] b\n[x] c\npara\n[x] d\n[ ] e');
    expect(tickedDown(lines).map((l) => l.text)).toEqual(['b', 'a', 'c', 'para', 'e', 'd']);
    expect(noteToHtml('Plan <b>\n[x] milk\n[ ] bread\n- one\n- two\nend')).toBe(
      '<h1>Plan &lt;b&gt;</h1><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked></label><div><p>milk</p></div></li>'
      + '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>bread</p></div></li></ul><ul><li><p>one</p></li><li><p>two</p></li></ul><p>end</p>');
  });
});
