import { describe, expect, it } from 'vitest';
import { nextChat } from './chat-client';

// M121: Alt+↑/↓ moves through the chat list; Alt+Shift+↓ finds the next chat with unread messages.
const order = [{ id: 'a', unread: false }, { id: 'b', unread: true }, { id: 'c', unread: false }, { id: 'd', unread: true }];

describe('chat keys', () => {
  it('steps up and down, and stops at the ends', () => {
    expect(nextChat(order, 'b', 1)).toBe('c');
    expect(nextChat(order, 'b', -1)).toBe('a');
    expect(nextChat(order, 'd', 1)).toBeNull();
    expect(nextChat(order, 'a', -1)).toBeNull();
  });
  it('starts at the top or the bottom when no chat is open', () => {
    expect(nextChat(order, null, 1)).toBe('a');
    expect(nextChat(order, null, -1)).toBe('d');
    expect(nextChat([], null, 1)).toBeNull();
  });
  it('finds the next unread chat, going round, never the open one', () => {
    expect(nextChat(order, 'b', 1, true)).toBe('d');
    expect(nextChat(order, 'd', 1, true)).toBe('b');
    expect(nextChat(order, null, 1, true)).toBe('b');
    expect(nextChat([{ id: 'b', unread: true }], 'b', 1, true)).toBeNull();
    expect(nextChat([{ id: 'a', unread: false }], null, 1, true)).toBeNull();
  });
});
