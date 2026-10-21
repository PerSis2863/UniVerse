import { describe, expect, it } from 'vitest';
import { matchesAccept } from './use-file-drop';
import { parseViews, withView } from './saved-views';

describe('Phase E helpers', () => {
  it('lets a dropped or pasted file through only when the field would take it', () => {
    const pdf = { name: 'Note.PDF', type: 'application/pdf' };
    const shot = { name: 'image.png', type: 'image/png' };
    const zip = { name: 'work.zip', type: '' };
    expect(matchesAccept(pdf, 'image/*,application/pdf')).toBe(true);
    expect(matchesAccept(shot, 'image/*,application/pdf')).toBe(true);
    expect(matchesAccept(zip, 'image/*,application/pdf')).toBe(false);
    expect(matchesAccept(zip, '.pdf,.zip')).toBe(true);
    expect(matchesAccept(pdf, '.pdf,.zip')).toBe(true);
    expect(matchesAccept(zip, undefined)).toBe(true);
    expect(matchesAccept(zip, '')).toBe(true);
  });

  it('keeps up to 8 saved views, newest first, one per name', () => {
    expect(parseViews('not json')).toEqual([]);
    expect(parseViews('[{"name":"","value":1},{"name":"A","value":{"role":"ADMIN"}},{"nope":1}]')).toEqual([{ name: 'A', value: { role: 'ADMIN' } }]);
    let views = withView<number>([], 'Teachers', 1);
    views = withView(views, 'pending', 2);
    views = withView(views, 'teachers ', 3);
    expect(views).toEqual([{ name: 'teachers', value: 3 }, { name: 'pending', value: 2 }]);
    for (let i = 0; i < 10; i++) views = withView(views, `v${i}`, i);
    expect(views).toHaveLength(8);
    expect(views[0].name).toBe('v9');
  });
});
