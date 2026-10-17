import { describe, expect, it } from 'vitest';
import { cleanPrefs, DEFAULT_PREFS, digestText, groupOfPush, nextDigestAt, pushDecision, GROUP_OF_TYPE } from './notify-prefs';

describe('notification settings', () => {
  it('cleans what comes from storage or a request', () => {
    const p = cleanPrefs('{"push":{"grades":"digest","calls":"loud","nope":"off"},"muted":["course-1","course-1","bad id!"],"digest":false,"digestHour":30}');
    expect(p.push.grades).toBe('digest');
    expect(p.push.calls).toBe('push');
    expect(p.muted).toEqual(['course-1']);
    expect(p.digest).toBe(false);
    expect(p.digestHour).toBe(18);
    expect(cleanPrefs(null)).toEqual(DEFAULT_PREFS);
  });
  it('knows which group a push or a notification is in', () => {
    expect(groupOfPush({ tag: 'mention-/docs/x' })).toBe('mentions');
    expect(groupOfPush({ tag: 'scheduled-abc' })).toBe('calls');
    expect(groupOfPush({ tag: 'support-plan' })).toBe('grades');
    expect(groupOfPush({ tag: 'something-new' })).toBe('other');
    expect(groupOfPush({ kind: 'tasks', tag: 'mention-x' })).toBe('tasks');
    expect(GROUP_OF_TYPE('grade')).toBe('grades');
    expect(GROUP_OF_TYPE('info')).toBe('other');
  });
  it('sends now, keeps for the daily summary or drops, as the person chose', () => {
    const p = cleanPrefs({ push: { school: 'digest', messages: 'off' }, muted: ['course-1'] });
    expect(pushDecision(p, { tag: 'consent-1' })).toBe('digest');
    expect(pushDecision(p, { tag: 'chat-1' })).toBe('off');
    expect(pushDecision(p, { tag: 'scheduled-1', courseId: 'course-1' })).toBe('digest'); // a muted course
    expect(pushDecision(p, { tag: 'scheduled-1', courseId: 'course-2' })).toBe('push');
    expect(pushDecision(p, { tag: 'chat-1', call: true })).toBe('push'); // a call always rings
    expect(pushDecision({ ...p, digest: false }, { tag: 'consent-1' })).toBe('off'); // no summary: nothing
  });
  it('words the daily summary', () => {
    expect(digestText({})).toBeNull();
    expect(digestText({ grades: 3, school: 2, mentions: 1 })).toEqual({ title: 'Your day: 6 new notifications', body: '3 grades and feedback, 2 school updates, 1 mention' });
  });
  it('times the summary at the hour of the person\'s own day', () => {
    const from = Date.parse('2026-10-16T10:00:00Z'); // 15:30 in Kolkata
    expect(nextDigestAt('Asia/Kolkata', 18, from).toISOString()).toBe('2026-10-16T12:30:00.000Z');
    expect(nextDigestAt('Asia/Kolkata', 9, from).toISOString()).toBe('2026-10-17T03:30:00.000Z');
    expect(pushDecision(cleanPrefs({ push: { other: 'off' } }), { tag: 'daily-brief' })).toBe('push'); // has its own switch
  });
});
