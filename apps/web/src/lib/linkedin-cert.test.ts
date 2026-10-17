import { describe, expect, it } from 'vitest';
import { linkedInAddCertificationUrl } from './linkedin-cert';

describe('linkedInAddCertificationUrl', () => {
  it('builds LinkedIn add-certification URL with year, month and cert id', () => {
    const url = linkedInAddCertificationUrl({
      name: 'Climate Education Volunteer',
      organizationName: 'UniVerse Impact',
      issuedAt: '2026-03-15T12:00:00.000Z',
      certUrl: 'https://universeimpact.com/verify/abc',
      certId: 'UV-2026-001',
    });
    expect(url.startsWith('https://www.linkedin.com/profile/add?')).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get('startTask')).toBe('CERTIFICATION_NAME');
    expect(q.get('name')).toBe('Climate Education Volunteer');
    expect(q.get('organizationName')).toBe('UniVerse Impact');
    expect(q.get('issueYear')).toBe('2026');
    expect(q.get('issueMonth')).toBe('3');
    expect(q.get('certId')).toBe('UV-2026-001');
    expect(q.get('certUrl')).toContain('/verify/abc');
  });
});
