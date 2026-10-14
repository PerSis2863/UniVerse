import { route } from '@/server/assignments';
import { BadRequestException } from '@/server/http';
import { askAboutChild, makeSummary, parentWeek, setCopilotPrefs } from '@/server/parent-copilot';

// The parent co-pilot (Stage 5 · D16; parent accounts only). GET ?studentId&date&tz&lang: the child's
// week from the records, its summary, my settings and recent questions. POST { action }: 'summary'
// (write this week's summary in my language), 'ask' { question } (an answer from the records), 'prefs'
// { lang?, weekly?, weekday?, hour? }.
export const GET = (req: Request) => route(req, (user) => parentWeek(user, new URL(req.url).searchParams));
export const POST = (req: Request) => route(req, async (user) => {
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (b.action === 'summary') return makeSummary(user, b);
  if (b.action === 'ask') return askAboutChild(user, b);
  if (b.action === 'prefs') return setCopilotPrefs(user, b);
  throw new BadRequestException('Unknown action.');
});
