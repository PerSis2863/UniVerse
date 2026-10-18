import { describe, expect, it } from 'vitest';
import { cvHtml, type CvInput } from './cv-html';

const base: CvInput = {
  template: 'classic', accent: '#059669', name: 'Ada <Lovelace>', headline: 'CS student', contact: 'ada@example.com', summary: 'I build things.',
  evidence: [{ label: 'Programming', count: 3, best: '92%' }],
  credentials: [{ title: 'Climate volunteer', projectName: 'Trees', organization: 'Green NGO', hoursCompleted: 20, issuedAt: '2026-03-15T00:00:00Z', verifyUrl: 'https://universeimpact.com/verify/abc', certificateCode: 'UV-1' }],
  skills: [{ name: 'Python', level: 'ADVANCED' }], courses: [], impact: { hours: 20, people: 40, credentials: 1 },
};

describe('the CV page', () => {
  it('writes every part as plain, escaped text, leaving out empty parts', () => {
    const html = cvHtml(base);
    expect(html).toContain('Ada &lt;Lovelace&gt;');
    expect(html).not.toContain('<Lovelace>');
    expect(html).toContain('Programming</b>: 3 pieces of evidence (best: 92%)');
    expect(html).toContain('20 verified hours');
    expect(html).toContain('Python (Advanced)');
    expect(html).toContain('Mar 2026');
    expect(html).not.toContain('cv-courses');
  });

  it('has three looks, and keeps an unsafe colour out', () => {
    expect(cvHtml({ ...base, template: 'modern' })).toContain('cv-modern');
    expect(cvHtml({ ...base, template: 'compact' })).toContain('cv-grid');
    expect(cvHtml({ ...base, accent: 'red;}</style><script>' })).not.toContain('<script>');
  });
});
