import { describe, expect, it } from 'vitest';
import { agendaClock, clockText, isMeetingTemplate, MEETING_TEMPLATES, templateById, totalMinutes, type Agenda } from './call-agenda';

const a: Agenda = { items: [{ title: 'Talk', minutes: 2, who: 'Asha' }, { title: 'Questions', minutes: 1, who: null }], current: 0, startedAt: 1_000_000, by: 'T' };

describe('call agenda', () => {
  it('works out the time left, nearly up and over', () => {
    expect(agendaClock(a, 1_000_000 + 30_000)).toMatchObject({ index: 0, elapsed: 30, left: 90, soon: false, overrun: false, last: false });
    expect(agendaClock(a, 1_000_000 + 70_000)).toMatchObject({ left: 50, soon: true });
    expect(agendaClock(a, 1_000_000 + 150_000)).toMatchObject({ left: -30, overrun: true, soon: false });
    expect(agendaClock(a, 1_000_000)?.next?.title).toBe('Questions');
    expect(agendaClock({ ...a, current: null }, 0)).toBeNull();
    expect(agendaClock(null, 0)).toBeNull();
  });
  it('shows clock times', () => {
    expect([clockText(65), clockText(-30), clockText(3725)]).toEqual(['1:05', '0:30', '1:02:05']);
  });
  it('has the meeting templates', () => {
    expect(MEETING_TEMPLATES.map((t) => t.id)).toEqual(['class', 'office', 'parent', 'interview', 'viva']);
    expect(totalMinutes(templateById('viva')!.agenda)).toBe(70);
    expect(templateById('viva')!.agenda[1].who).toBe('Examiner 1');
    expect(isMeetingTemplate('party')).toBe(false);
  });
});
