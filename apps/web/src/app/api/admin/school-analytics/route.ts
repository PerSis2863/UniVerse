import { route } from '@/server/assignments';
import { BadRequestException, ForbiddenException } from '@/server/http';
import { askSchool, runMetric } from '@/server/school-analytics';
import { isMetricId } from '@/lib/school-metrics';

// School analytics for admins (Insights → School insights).
// GET ?metric=<id>&days=&order=&department=  one measure from the catalogue, no AI
// GET ?metrics=<id>,<id>…                    up to 4 measures with their usual settings (the trend cards)
// POST { question }                          a question in plain words: AI only picks the measure

const adminOnly = (role: string) => {
  if (role !== 'ADMIN') throw new ForbiddenException('School analytics are for admins.');
};

export const GET = (req: Request) => route(req, async (user) => {
  adminOnly(user.role);
  const p = new URL(req.url).searchParams;
  const many = p.get('metrics');
  if (many) {
    const ids = [...new Set(many.split(','))].filter(isMetricId).slice(0, 4);
    return { results: await Promise.all(ids.map((id) => runMetric(id))) };
  }
  const id = p.get('metric');
  if (!isMetricId(id)) throw new BadRequestException('Unknown measure.');
  return runMetric(id, { days: Number(p.get('days')) || null, order: p.get('order'), department: p.get('department') });
});

export const POST = (req: Request) => route(req, async (user) => {
  adminOnly(user.role);
  const body = (await req.json().catch(() => ({}))) as { question?: unknown };
  return askSchool(user, typeof body.question === 'string' ? body.question : '');
});
