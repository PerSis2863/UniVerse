import { describe, expect, it } from 'vitest';
import { CHAT_MAX, cleanChat } from './play-chat';

describe('room chat', () => {
  it('passes friendly messages, trimmed and short', () => {
    expect(cleanChat('  follow   me!  ')).toEqual({ text: 'follow me!' });
    expect((cleanChat('a'.repeat(500)) as { text: string }).text).toHaveLength(CHAT_MAX);
  });
  it('hides links, e-mails and numbers, and refuses unsafe messages', () => {
    expect(cleanChat('see www.example.com or me@x.com')).toEqual({ text: 'see [link] or [email]' });
    expect(cleanChat('call 98765 43210 now')).toEqual({ text: 'call [number]now' });
    expect('blocked' in cleanChat('kys loser')).toBe(true);
    expect('blocked' in cleanChat('where do you live')).toBe(true);
    expect('blocked' in cleanChat('   ')).toBe(true);
    expect('blocked' in cleanChat(42)).toBe(true);
  });
});
