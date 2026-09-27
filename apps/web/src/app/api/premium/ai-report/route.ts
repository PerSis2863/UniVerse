import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireFeature } from '@/lib/billing';

const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';

const SYSTEM_PROMPT = `You write concise, board-ready executive impact reports for an education and
social-impact organization using the UniVerse platform. Use ONLY the figures in the data provided —
never invent numbers, names, partners or trends. If data is sparse, say so plainly and recommend how to
grow it. Format in Markdown with these sections: "Executive summary", "Engagement", "Social impact",
"Risks & gaps", "Recommended next steps" (3-5 bullets). Keep it under 450 words.`;

async function callGemini(model: string, apiKey: string, prompt: string) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: { temperature: 0.4, maxOutputTokens: 1400 },
    }),
  });
}

export async function POST(req: Request) {
  const auth = await requireFeature(req, 'ai_impact_reports');
  if (auth instanceof NextResponse) return auth;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI is not configured (missing GEMINI_API_KEY).' }, { status: 503 });

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const [roles, newMembers, courses, enrollments, impactAll, impactRecent, applications, activeProjects, ngos, certificates] =
    await Promise.all([
      prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      prisma.user.count({ where: { createdAt: { gte: ninetyDaysAgo } } }),
      prisma.course.count(),
      prisma.enrollment.count(),
      prisma.impactPoint.aggregate({ _sum: { points: true }, _count: { _all: true } }),
      prisma.impactPoint.aggregate({ where: { awardedAt: { gte: ninetyDaysAgo } }, _sum: { points: true } }),
      prisma.nGOProjectApplication.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.nGOProject.count({ where: { isActive: true } }),
      prisma.nGO.count(),
      prisma.impactCertificate.count(),
    ]);

  const data = {
    organization: auth.org.name,
    generatedAt: new Date().toISOString().slice(0, 10),
    membersByRole: Object.fromEntries(roles.map((r) => [r.role, r._count._all])),
    newMembersLast90Days: newMembers,
    courses,
    enrollments,
    impactPointsAllTime: impactAll._sum.points ?? 0,
    impactAwardsAllTime: impactAll._count._all,
    impactPointsLast90Days: impactRecent._sum.points ?? 0,
    ngoApplicationsByStatus: Object.fromEntries(applications.map((a) => [a.status, a._count._all])),
    activeNgoProjects: activeProjects,
    ngoPartnersOnPlatform: ngos,
    impactCertificatesIssued: certificates,
  };

  const prompt = `Write the executive impact report from this live platform data:\n\n${JSON.stringify(data, null, 2)}`;
  let res = await callGemini(PRIMARY_MODEL, apiKey, prompt);
  if ((res.status === 404 || res.status === 400) && FALLBACK_MODEL !== PRIMARY_MODEL) {
    res = await callGemini(FALLBACK_MODEL, apiKey, prompt);
  }
  if (!res.ok) {
    console.error('AI report failed:', res.status, await res.text());
    return NextResponse.json({ error: 'The AI service is unavailable right now. Please try again shortly.' }, { status: 502 });
  }
  const json = await res.json();
  const report: string = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
  if (!report.trim()) return NextResponse.json({ error: 'The AI returned an empty report. Please try again.' }, { status: 502 });

  return NextResponse.json({ report, data });
}
