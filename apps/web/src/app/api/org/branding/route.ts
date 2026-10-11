import { NextResponse } from "next/server";
import { resolveTenant } from "@/server/tenant";

// Stage 5 · C2: Multi-school SaaS: public branding endpoint for the school portal.
// Returns school name, crest, colors, and custom title matching the current host or ?slug=...

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const branding = await resolveTenant(req, slug);

  return NextResponse.json(branding, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=300",
    },
  });
}
