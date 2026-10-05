import prisma from '@/lib/db';
import { ownerEmailList } from '@/lib/owner-emails';
import { geminiJson } from './gemini';
import { APP_URL, escapeHtml, sendEmail } from './email';

// Automatic error monitoring. Browsers (src/lib/error-monitor.ts → POST /api/errors) and the server
// (router 500s, route handlers) report errors here. The same problem is grouped into one row by a
// fingerprint that ignores ids, numbers and build hashes. The daily job asks AI to diagnose new
// problems and emails the owner a digest; the owner reviews them in /console → Errors.
// Nothing here changes code by itself: fixes are reviewed and deployed by a person.

export interface ErrorInput {
  source: 'CLIENT' | 'SERVER';
  kind: string;
  message: string;
  stack?: string | null;
  path?: string | null;
  userAgent?: string | null;
  userId?: string | null;
}

const MAX_GROUPS = 2000; // stop creating new groups past this (existing ones still count)

// Not bugs in UniVerse: browser extensions, cross-origin script noise, the user going offline.
const NOISE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /(chrome|moz|safari(-web)?)-extension:\/\//i,
  /Non-Error promise rejection captured/i,
  /AbortError|The (user|operation) aborted/i,
  /^(TypeError: )?(Failed to fetch|NetworkError when attempting to fetch resource\.|Load failed|cancelled)$/i,
  /firebaseinstallations|googletagmanager|gtag/i,
];

export function isNoise(message: string, stack?: string | null) {
  return NOISE.some((re) => re.test(message) || (!!stack && re.test(stack)));
}

/** The message with the parts that vary between occurrences replaced. */
export function normalise(message: string) {
  return message
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\b[0-9a-f]{8,}\b/gi, '<hash>')
    .replace(/\bc[a-z0-9]{20,}\b/g, '<id>')
    .replace(/(["'`]).{1,80}?\1/g, '<str>')
    .replace(/\d+/g, '<n>')
    .slice(0, 300);
}

function firstFrame(stack?: string | null) {
  const line = stack?.split('\n').find((l) => /\bat\b|@/.test(l) && !/node_modules|<anonymous>/.test(l)) ?? '';
  // Keep the function and file name, drop build hashes and line numbers.
  return line.replace(/[?#].*$/, '').replace(/[-.][0-9a-f]{8,}/gi, '').replace(/:\d+(:\d+)?\)?$/, '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

async function sha(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const cleanPath = (p?: string | null) => {
  if (!p) return null;
  try {
    const u = new URL(p, 'https://x');
    return u.pathname.replace(/\/c[a-z0-9]{20,}/g, '/:id').slice(0, 200);
  } catch {
    return null;
  }
};

/** Records one occurrence. Never throws. */
export async function recordError(input: ErrorInput): Promise<void> {
  try {
    const message = (input.message || 'Unknown error').slice(0, 500);
    if (isNoise(message, input.stack)) return;
    const path = cleanPath(input.path);
    const fingerprint = await sha(`${input.source}|${input.kind}|${normalise(message)}|${firstFrame(input.stack)}|${input.source === 'SERVER' ? path : ''}`);
    const existing = await prisma.errorReport.findUnique({ where: { fingerprint }, select: { id: true, status: true, lastUserId: true } });
    const now = new Date();
    if (existing) {
      if (existing.status === 'IGNORED') {
        await prisma.errorReport.update({ where: { id: existing.id }, data: { count: { increment: 1 }, lastSeen: now } });
        return;
      }
      const differentUser = !!input.userId && input.userId !== existing.lastUserId;
      await prisma.errorReport.update({
        where: { id: existing.id },
        data: {
          count: { increment: 1 },
          users: differentUser ? { increment: 1 } : undefined,
          lastSeen: now,
          lastUserId: input.userId ?? undefined,
          path: path ?? undefined,
          // A resolved problem that happens again is back on the list (a regression).
          ...(existing.status === 'RESOLVED' ? { status: 'NEW', resolvedAt: null } : {}),
        },
      });
      return;
    }
    if ((await prisma.errorReport.count()) >= MAX_GROUPS) return;
    await prisma.errorReport.create({
      data: {
        fingerprint,
        source: input.source,
        kind: input.kind.slice(0, 20),
        message,
        stack: input.stack?.slice(0, 4000) ?? null,
        path,
        userAgent: input.userAgent?.slice(0, 200) ?? null,
        lastUserId: input.userId ?? null,
      },
    });
  } catch (e) {
    console.error('recordError failed:', e);
  }
}

/** For server code: record an exception from a request. */
export function recordServerError(error: unknown, req: Request, userId?: string | null) {
  const e = error instanceof Error ? error : new Error(String(error));
  return recordError({ source: 'SERVER', kind: 'api', message: `${req.method} failed: ${e.name}: ${e.message}`, stack: e.stack, path: new URL(req.url).pathname, userId });
}

const SYSTEM = `You are a senior engineer on UniVerse, a web app and installable PWA for universities.
Stack: Next.js 16 (App Router, webpack) deployed to Cloudflare Workers with OpenNext; database Cloudflare D1
(SQLite) through Prisma 6; sign-in with Firebase Authentication; API routes under /api (core platform API in
src/server/modules via a router at /api/core/*, other routes in src/app/api/**/route.ts); client data with SWR;
live updates and whiteboards through Durable Objects (cloudflare/worker.ts); UI in React 19 + Tailwind.
Diagnose production errors. Be concrete and brief. If the cause can't be known from the data, say what to check.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    severity: { type: 'STRING', enum: ['low', 'medium', 'high'] },
    summary: { type: 'STRING', description: 'One sentence: what is going wrong, for a non-developer.' },
    cause: { type: 'STRING', description: 'The most likely technical cause.' },
    where: { type: 'STRING', description: 'Files, components or routes to look at.' },
    fix: { type: 'STRING', description: 'The suggested fix, step by step, with a short code sketch if useful.' },
  },
  required: ['severity', 'summary', 'cause', 'where', 'fix'],
};

/** Asks AI to diagnose error groups (the given ids, or up to `limit` new ones). Returns how many. */
export async function diagnoseErrors(opts: { ids?: string[]; limit?: number; model?: string } = {}): Promise<number> {
  const rows = await prisma.errorReport.findMany({
    where: opts.ids ? { id: { in: opts.ids } } : { status: 'NEW', diagnosedAt: null },
    orderBy: [{ count: 'desc' }, { lastSeen: 'desc' }],
    take: opts.ids ? 10 : opts.limit ?? 8,
  });
  let done = 0;
  for (const r of rows) {
    const prompt = [
      `Source: ${r.source === 'CLIENT' ? 'browser' : 'server'} (${r.kind})`,
      `Where: ${r.path ?? 'unknown'}`,
      `Happened ${r.count} time(s) to about ${r.users} user(s), first ${r.firstSeen.toISOString()}, last ${r.lastSeen.toISOString()}`,
      r.userAgent ? `Browser: ${r.userAgent}` : '',
      `Message: ${r.message}`,
      r.stack ? `Stack:\n${r.stack.slice(0, 2500)}` : 'No stack trace.',
    ].filter(Boolean).join('\n');
    const out = await geminiJson<{ severity: string; summary: string; cause: string; where: string; fix: string }>(SYSTEM, prompt, SCHEMA, 800, true, opts.model);
    if (!out) continue;
    await prisma.errorReport.update({
      where: { id: r.id },
      data: {
        severity: ['low', 'medium', 'high'].includes(out.severity) ? out.severity : 'medium',
        diagnosis: `**${out.summary}**\n\n**Likely cause:** ${out.cause}\n\n**Where to look:** ${out.where}\n\n**Suggested fix:** ${out.fix}`.slice(0, 6000),
        diagnosedAt: new Date(),
        status: r.status === 'NEW' ? 'DIAGNOSED' : r.status,
      },
    });
    done++;
  }
  return done;
}

/** Emails the owner(s) about problems first seen or back since the last digest. */
export async function emailErrorDigest(since: Date): Promise<number> {
  const owners = ownerEmailList(process.env.SUPER_ADMIN_EMAILS);
  if (!owners.length) return 0;
  const rows = await prisma.errorReport.findMany({
    where: { status: { in: ['NEW', 'DIAGNOSED'] }, lastSeen: { gte: since } },
    orderBy: [{ count: 'desc' }],
    take: 15,
  });
  if (!rows.length) return 0;
  const items = rows.map((r) => {
    const summary = r.diagnosis?.match(/^\*\*(.+?)\*\*/)?.[1] ?? r.message;
    return `<li style="margin-bottom:10px"><strong>${escapeHtml(summary)}</strong><br><span style="color:#666">${escapeHtml(r.path ?? '')} · ${r.count}× · ${r.users} user(s)${r.severity ? ` · ${r.severity}` : ''}</span></li>`;
  });
  const html = `<div style="font-family:system-ui,sans-serif;max-width:600px"><h2>UniVerse: ${rows.length} problem(s) need a look</h2><ul style="padding-left:18px">${items.join('')}</ul><p><a href="${APP_URL()}/console?tab=errors">Open the owner console →</a></p></div>`;
  const text = `${rows.length} problem(s) need a look:\n\n${rows.map((r) => `- ${r.message} (${r.path ?? ''}, ${r.count}x)`).join('\n')}\n\n${APP_URL()}/console?tab=errors`;
  await Promise.all(owners.map((to) => sendEmail(to, `UniVerse: ${rows.length} new problem(s) detected`, html, text)));
  return rows.length;
}
