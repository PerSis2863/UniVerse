import { describe, expect, it } from 'vitest';
import { childrenOf, docLinkIds, makesLoop, topLevel } from './doc-pages';

const A = 'cmv3zml4m0018o3huy829i8sg', B = 'cmv4aaaaa0000aaaaaaaaaaaa';

describe('doc pages', () => {
  it('finds links to other pages', () => {
    const html = `<p><a href="/docs/${A}">one</a> <a href="https://uni.example/docs/${B}?x=1#h">two</a> <a href="/docs/${A}">again</a> <a href="/tasks/${B}">task</a> <a href="/docs/short">bad</a></p>`;
    expect(docLinkIds(html)).toEqual([A, B]);
    expect(docLinkIds(html, A)).toEqual([B]);
  });
  it('builds the tree', () => {
    const docs = [{ id: 'a', parentId: null }, { id: 'b', parentId: 'a' }, { id: 'c', parentId: 'b' }, { id: 'd', parentId: 'gone' }];
    expect(topLevel(docs).map((d) => d.id)).toEqual(['a', 'd']);
    expect(childrenOf(docs).get('a')?.map((d) => d.id)).toEqual(['b']);
  });
  it('refuses moves that loop', () => {
    const up: Record<string, string | null> = { a: null, b: 'a', c: 'b' };
    expect(makesLoop('a', 'c', (id) => up[id])).toBe(true);
    expect(makesLoop('a', 'a', (id) => up[id])).toBe(true);
    expect(makesLoop('c', 'a', (id) => up[id])).toBe(false);
    expect(makesLoop('b', null, (id) => up[id])).toBe(false);
  });
});
