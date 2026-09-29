import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin } from '@/lib/billing';
import { PLANS } from '@/lib/plans';

const SUPPORT_INBOX = process.env.SUPPORT_INBOX_EMAIL || 'myuniverseimpact@gmail.com';
const FROM = process.env.RESEND_FROM || 'UniVerse Support <onboarding@resend.dev>';

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// Organization admins contact the UniVerse team. Paid plans are tagged as priority, and
// Enterprise admins can request their included onboarding session. Each request is stored
// as a ticket and emailed to the support inbox with Reply-To set to the admin.
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { user, org, plan } = auth;

  const body = await req.json().catch(() => ({}));
  const kind = body.kind === 'onboarding' ? 'onboarding' : body.kind === 'sales' ? 'sales' : 'support';
  const subject = String(body.subject ?? '').trim().slice(0, 150);
  const message = String(body.message ?? '').trim().slice(0, 5000);

  if (kind === 'onboarding' && plan !== 'ENTERPRISE') {
    return NextResponse.json({ error: 'Onboarding sessions are included with the Enterprise plan.', upgradeRequired: true }, { status: 402 });
  }
  if (kind === 'support' && (!subject || !message)) {
    return NextResponse.json({ error: 'Please add a subject and a message.' }, { status: 400 });
  }

  const recent = await prisma.ticket.count({
    where: { authorId: user.id, category: { startsWith: 'Platform' }, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recent >= 5) return NextResponse.json({ error: 'You have sent several requests recently — we will get back to you soon.' }, { status: 429 });

  // "Contact us" for plans we quote individually (Admin → Billing): who they are and what they need.
  let salesPlan: string | null = null;
  if (kind === 'sales') {
    salesPlan = typeof body.plan === 'string' && body.plan in PLANS ? PLANS[body.plan as keyof typeof PLANS].name : 'Enterprise';
    const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
    const phone = str(body.phone, 30);
    const size = str(body.size, 40);
    if (!message) return NextResponse.json({ error: 'Tell us a little about what you need.' }, { status: 400 });
    const facts = [`Plan: ${salesPlan}`, size ? `Size: ${size}` : null, phone ? `Phone: ${phone}` : null].filter(Boolean);
    body.details = `${facts.join('\n')}\n\n${message}`;
  }
  const priority = kind === 'sales' || plan !== 'STARTER' ? 'HIGH' : 'MEDIUM';
  const planName = PLANS[plan].name;
  const title = kind === 'onboarding' ? 'Onboarding session request' : kind === 'sales' ? `${salesPlan} plan enquiry: ${org.name}` : subject;
  const details = kind === 'onboarding' ? message || 'Please get in touch to schedule our onboarding session.' : kind === 'sales' ? String(body.details) : message;

  const ticket = await prisma.ticket.create({
    data: {
      subject: title,
      description: details,
      category: kind === 'onboarding' ? 'Platform onboarding' : kind === 'sales' ? 'Platform sales' : 'Platform support',
      priority,
      authorId: user.id,
    },
  });

  let emailed = false;
  if (process.env.RESEND_API_KEY) {
    const tag = kind === 'sales' ? '[SALES] ' : plan === 'STARTER' ? '' : `[${planName.toUpperCase()} · PRIORITY] `;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [SUPPORT_INBOX],
        reply_to: user.email,
        subject: `${tag}${title}`,
        html: `<p><strong>${escapeHtml(user.name)}</strong> (${escapeHtml(user.email)}) · ${escapeHtml(org.name)} · ${planName} plan</p>
<p style="white-space:pre-wrap">${escapeHtml(details)}</p>
<p style="color:#888">Ticket ${ticket.id}</p>`,
      }),
    }).catch(() => null);
    emailed = !!res?.ok;
    if (res && !res.ok) console.error('Support email failed:', res.status, await res.text());
  }

  return NextResponse.json({ ticketId: ticket.id, emailed, priority: priority === 'HIGH', supportEmail: SUPPORT_INBOX });
}
