import { NextResponse } from "next/server";
import { resolveTenant } from "@/server/tenant";

// Stage 5 · C2: Multi-school SaaS: dynamic PWA manifest tailored per school host/subdomain.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const branding = await resolveTenant(req, slug);

  const name = branding.appTitle || (branding.isSchool ? `${branding.name} UniVerse` : "UniVerse Impact");
  const shortName = branding.slug ? branding.slug.toUpperCase() : (branding.isSchool ? branding.name.slice(0, 12) : "UniVerse");
  const themeColor = branding.brandColor || "#6366f1";

  const manifest = {
    name,
    short_name: shortName,
    description: branding.tagline || "The Campus Operating System",
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: themeColor,
    icons: [
      {
        src: branding.logoUrl || "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable"
      },
      {
        src: branding.logoUrl || "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable"
      }
    ]
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
