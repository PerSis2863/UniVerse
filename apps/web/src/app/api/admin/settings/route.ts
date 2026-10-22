import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/billing";
import { hasR2Storage } from "@/lib/r2";
import { isDemoLoginEnabled } from "@/server/auth";
import { audit } from "@/server/audit";
import { cleanSlug, cleanCustomDomain, cleanBrandColor } from "@/server/tenant";
import { peopleWhere } from "@/server/school-scope";

// Admin → Settings: the organization details, branding, subdomains, and security status.

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  // The admin's own school's applications and accounts only.
  const mine = await peopleWhere(auth.user);
  const [pendingApplications, suspended, memberCount] = await Promise.all([
    prisma.roleApplication.count({ where: { status: "PENDING", user: mine } }),
    prisma.user.count({ where: { AND: [mine, { status: "SUSPENDED" }] } }),
    prisma.user.count({ where: { organizationId: auth.org.id } }),
  ]);

  return NextResponse.json(
    {
      organization: {
        id: auth.org.id,
        name: auth.org.name,
        slug: auth.org.slug,
        customDomain: auth.org.customDomain,
        brandColor: auth.org.brandColor,
        logoUrl: auth.org.logoUrl,
        appTitle: auth.org.appTitle,
        tagline: auth.org.tagline,
        seats: auth.org.seats,
        usedSeats: memberCount,
        plan: auth.plan,
      },
      security: {
        demoLogin: isDemoLoginEnabled(),
        email: !process.env.RESEND_API_KEY,
        credentialSigning: !process.env.CREDENTIAL_SIGNING_PRIVATE_KEY,
        fileStorage: hasR2Storage(),
        pendingApplications,
        suspendedAccounts: suspended,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const data: {
    name?: string;
    slug?: string | null;
    customDomain?: string | null;
    brandColor?: string | null;
    logoUrl?: string | null;
    appTitle?: string | null;
    tagline?: string | null;
  } = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!name) return NextResponse.json({ error: "Enter the organization name." }, { status: 400 });
    data.name = name;
  }

  if (body.slug !== undefined) {
    if (body.slug === null || body.slug === "") {
      data.slug = null;
    } else {
      const slug = cleanSlug(body.slug);
      const existing = await prisma.organization.findFirst({
        where: { slug, NOT: { id: auth.org.id } },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json({ error: `The subdomain "${slug}" is already taken.` }, { status: 400 });
      }
      data.slug = slug;
    }
  }

  if (body.customDomain !== undefined) {
    if (body.customDomain === null || body.customDomain === "") {
      data.customDomain = null;
    } else {
      const customDomain = cleanCustomDomain(body.customDomain);
      if (customDomain) {
        const existing = await prisma.organization.findFirst({
          where: { customDomain, NOT: { id: auth.org.id } },
          select: { id: true },
        });
        if (existing) {
          return NextResponse.json({ error: `Domain "${customDomain}" is already connected to another school.` }, { status: 400 });
        }
      }
      data.customDomain = customDomain;
    }
  }

  if (body.brandColor !== undefined) {
    data.brandColor = cleanBrandColor(body.brandColor);
  }

  if (body.logoUrl !== undefined) {
    data.logoUrl = typeof body.logoUrl === "string" ? body.logoUrl.trim().slice(0, 500) || null : null;
  }

  if (body.appTitle !== undefined) {
    data.appTitle = typeof body.appTitle === "string" ? body.appTitle.trim().slice(0, 80) || null : null;
  }

  if (body.tagline !== undefined) {
    data.tagline = typeof body.tagline === "string" ? body.tagline.trim().slice(0, 160) || null : null;
  }

  const updated = await prisma.organization.update({
    where: { id: auth.org.id },
    data,
  });

  audit(
    auth.user,
    {
      action: "organization.updated",
      summary: `Updated settings for ${updated.name}`,
      targetType: "organization",
      targetId: auth.org.id,
    },
    req,
  );

  return NextResponse.json({ ok: true, organization: updated });
}
