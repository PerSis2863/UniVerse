import { describe, expect, it } from 'vitest';
import { cleanAppUrl, cleanCommands, commandsOf, parseAppReply, permissionsOf } from './chat-apps';
import { computeWebhookSignature, verifyWebhookSignature } from './webhooks';

// Stage 5 · Q20 Chat apps: the rules for commands, addresses and what an app may answer.
describe('chat apps', () => {
  it('takes 1–5 clean commands, never UniVerse’s own', () => {
    expect(cleanCommands([{ name: '/Library', hint: ' Find a book ' }, { name: 'library', hint: 'again' }, { name: 'bus-times', hint: '' }]))
      .toEqual([{ name: 'library', hint: 'Find a book' }, { name: 'bus-times', hint: '' }]);
    expect(() => cleanCommands([{ name: 'ask', hint: '' }])).toThrow('UniVerse’s own');
    expect(() => cleanCommands([{ name: 'a', hint: '' }])).toThrow('2–20 letters');
    expect(() => cleanCommands([{ name: 'drop table', hint: '' }])).toThrow();
    expect(() => cleanCommands([])).toThrow('at least one');
    expect(cleanCommands(Array.from({ length: 8 }, (_, i) => ({ name: `cmd${i}`, hint: '' })))).toHaveLength(5);
  });

  it('calls apps over https only (plain http to this machine only when testing locally)', () => {
    expect(cleanAppUrl('https://apps.school.edu/universe', false)).toBe('https://apps.school.edu/universe');
    expect(() => cleanAppUrl('http://apps.school.edu/x', false)).toThrow('https://');
    expect(() => cleanAppUrl('http://localhost:9000/x', false)).toThrow('https://');
    expect(cleanAppUrl('http://localhost:9000/x', true)).toBe('http://localhost:9000/x');
    expect(() => cleanAppUrl('http://localhost.evil.com/x', true)).toThrow('https://');
    expect(() => cleanAppUrl('https://user:pw@apps.school.edu/', false)).toThrow('password');
    expect(() => cleanAppUrl('not a url', false)).toThrow();
  });

  it('reads the app’s answer as JSON or text, shortened, and its visibility', () => {
    expect(parseAppReply('{"text":"Room 4 is free","visibility":"me"}', 'application/json')).toEqual({ text: 'Room 4 is free', everyone: false });
    expect(parseAppReply('{"text":"Hi","visibility":"everyone"}', 'application/json; charset=utf-8')).toEqual({ text: 'Hi', everyone: true });
    expect(parseAppReply('  plain answer ', 'text/plain')).toEqual({ text: 'plain answer', everyone: null });
    expect(parseAppReply('{"nope":1}', 'application/json')).toBeNull();
    expect(parseAppReply('not json', 'application/json')).toBeNull();
    expect(parseAppReply('x'.repeat(5000), 'text/plain')?.text).toHaveLength(2000);
  });

  it('keeps only known permissions and well-formed commands from the database', () => {
    expect(permissionsOf('["post","admin","read_recent"]')).toEqual(['post', 'read_recent']);
    expect(permissionsOf('oops')).toEqual([]);
    expect(commandsOf('[{"name":"a","hint":"b"},{"name":3}]')).toEqual([{ name: 'a', hint: 'b' }]);
  });

  it('signs requests the way apps check them (same as webhooks)', () => {
    const body = '{"type":"chat.command"}';
    const t = Math.floor(Date.now() / 1000);
    const header = computeWebhookSignature(body, 'appsec_test', t);
    expect(verifyWebhookSignature(body, header, 'appsec_test')).toBe(true);
    expect(verifyWebhookSignature(body, header, 'appsec_other')).toBe(false);
  });
});
