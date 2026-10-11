"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Globe2, Loader2, Palette, Save, ShieldCheck, Sparkles } from "lucide-react";
import Link from "@/components/ui/Link";
import { authedJson } from "@/lib/authed-fetch";

// Admin Settings → Organization: branding, subdomain (<school>.universeimpact.com), custom domain, and security status.

type OrganizationData = {
  id: string;
  name: string;
  slug: string | null;
  customDomain: string | null;
  brandColor: string | null;
  logoUrl: string | null;
  appTitle: string | null;
  tagline: string | null;
  seats: number;
  usedSeats: number;
  plan: string;
};

type Settings = {
  organization: OrganizationData;
  security: {
    demoLogin: boolean;
    email: boolean;
    credentialSigning: boolean;
    fileStorage: boolean;
    pendingApplications: number;
    suspendedAccounts: number;
  };
};

const PRESET_COLORS = [
  { name: "Indigo", hex: "#4f46e5" },
  { name: "Crimson", hex: "#e11d48" },
  { name: "Emerald", hex: "#059669" },
  { name: "Amber", hex: "#d97706" },
  { name: "Violet", hex: "#7c3aed" },
  { name: "Sky", hex: "#0284c7" },
  { name: "Slate", hex: "#334155" },
];

function StatusRow({ ok, neutral, title, detail }: { ok: boolean; neutral?: boolean; title: string; detail: string }) {
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  return (
    <li className="flex items-start gap-3 p-4 rounded-2xl bg-[var(--fill)]">
      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${ok ? "text-emerald-500" : neutral ? "text-amber-500" : "text-rose-500"}`} />
      <div>
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</p>
        <p className="text-sm text-zinc-500 mt-0.5">{detail}</p>
      </div>
    </li>
  );
}

export function OrganizationSettings() {
  const { data, mutate } = useSWR<Settings>("/api/admin/settings", authedJson);
  const org = data?.organization;

  const [draft, setDraft] = useState<{
    name?: string;
    slug?: string;
    customDomain?: string;
    brandColor?: string;
    appTitle?: string;
    tagline?: string;
  }>({});
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const name = draft.name ?? org?.name ?? "";
  const slug = draft.slug ?? org?.slug ?? "";
  const customDomain = draft.customDomain ?? org?.customDomain ?? "";
  const brandColor = draft.brandColor ?? org?.brandColor ?? "#4f46e5";
  const appTitle = draft.appTitle ?? org?.appTitle ?? "";
  const tagline = draft.tagline ?? org?.tagline ?? "";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Organization name is required.");
      return;
    }
    setSaving(true);
    try {
      await authedJson("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || null,
          customDomain: customDomain.trim() || null,
          brandColor: brandColor.trim() || null,
          appTitle: appTitle.trim() || null,
          tagline: tagline.trim() || null,
        }),
      });
      await mutate();
      setDraft({});
      toast.success("School branding and portal settings saved!");
    } catch (err) {
      toast.error((err as Error).message || "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  const subdomainUrl = slug
    ? `https://${slug}.universeimpact.com`
    : null;

  const copySubdomain = () => {
    if (!subdomainUrl) return;
    navigator.clipboard.writeText(subdomainUrl);
    setCopied(true);
    toast.success("Subdomain copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8">
      {/* ── Multi-School SaaS Branding Form ── */}
      <form onSubmit={save} className="space-y-6">
        <div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-white mb-1 flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-tint-text" /> School Portal & Subdomain
          </h3>
          <p className="text-xs text-zinc-500">
            Customize your dedicated school portal address, branding, and color theme.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* School Name */}
          <div className="space-y-1.5">
            <label htmlFor="org-name" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              School Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="org-name"
              value={name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Riverside University"
              maxLength={120}
              required
              className="input w-full"
            />
          </div>

          {/* Subdomain */}
          <div className="space-y-1.5">
            <label htmlFor="org-slug" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              School Subdomain
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id="org-slug"
                value={slug}
                onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                placeholder="e.g. riverside"
                maxLength={32}
                className="input flex-1 font-mono text-sm"
              />
              <span className="text-xs text-zinc-500 font-mono shrink-0">.universeimpact.com</span>
            </div>
            {subdomainUrl && (
              <div className="flex items-center gap-2 pt-1 text-xs text-zinc-500">
                <button
                  type="button"
                  onClick={copySubdomain}
                  className="inline-flex items-center gap-1 text-tint-text hover:underline"
                >
                  <Copy className="w-3.5 h-3.5" /> {copied ? "Copied" : "Copy link"}
                </button>
                <span>•</span>
                <a
                  href={subdomainUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Visit portal
                </a>
              </div>
            )}
          </div>

          {/* Custom App Title */}
          <div className="space-y-1.5">
            <label htmlFor="org-title" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Custom App Title
            </label>
            <input
              id="org-title"
              value={appTitle}
              onChange={(e) => setDraft((d) => ({ ...d, appTitle: e.target.value }))}
              placeholder="e.g. Riverside UniVerse"
              maxLength={80}
              className="input w-full"
            />
            <p className="text-[11px] text-zinc-500">Shown in the top header and PWA install prompt.</p>
          </div>

          {/* Custom Domain */}
          <div className="space-y-1.5">
            <label htmlFor="org-domain" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Custom Domain (Optional)
            </label>
            <input
              id="org-domain"
              value={customDomain}
              onChange={(e) => setDraft((d) => ({ ...d, customDomain: e.target.value.toLowerCase() }))}
              placeholder="e.g. learn.riverside.edu"
              maxLength={120}
              className="input w-full font-mono text-sm"
            />
            <p className="text-[11px] text-zinc-500">Requires a CNAME pointing to universeimpact.com.</p>
          </div>

          {/* Tagline / Motto */}
          <div className="space-y-1.5 md:col-span-2">
            <label htmlFor="org-tagline" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              School Motto or Tagline
            </label>
            <input
              id="org-tagline"
              value={tagline}
              onChange={(e) => setDraft((d) => ({ ...d, tagline: e.target.value }))}
              placeholder="e.g. Inspiring tomorrow’s global changemakers"
              maxLength={160}
              className="input w-full"
            />
          </div>

          {/* Brand Accent Color */}
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-tint-text" /> Brand Accent Color
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="color"
                aria-label="Color picker"
                value={brandColor || "#4f46e5"}
                onChange={(e) => setDraft((d) => ({ ...d, brandColor: e.target.value }))}
                className="w-9 h-9 rounded-xl border border-zinc-200 dark:border-zinc-800 cursor-pointer bg-transparent"
              />
              <input
                type="text"
                aria-label="Color hex"
                value={brandColor || "#4f46e5"}
                onChange={(e) => setDraft((d) => ({ ...d, brandColor: e.target.value }))}
                maxLength={7}
                className="input w-28 font-mono text-xs uppercase"
              />
              <div className="flex items-center gap-1.5 ml-2">
                {PRESET_COLORS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, brandColor: p.hex }))}
                    className="w-6 h-6 rounded-lg transition-transform hover:scale-110 border border-black/10 dark:border-white/10"
                    style={{ backgroundColor: p.hex }}
                    title={p.name}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Live Portal Preview Card ── */}
        <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Student & Teacher Portal Preview
            </span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: brandColor || "#4f46e5" }}
            >
              LIVE THEME
            </span>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <p className="font-bold text-zinc-900 dark:text-white text-base">
                {appTitle || (name ? `${name} UniVerse` : "UniVerse Impact")}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {tagline || "The Campus Operating System"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
                style={{ backgroundColor: brandColor || "#4f46e5" }}
              >
                Sign In
              </span>
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <button type="submit" disabled={saving || !name.trim()} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save School Branding
          </button>
        </div>
      </form>

      {/* ── Security Status (existing) ── */}
      <div className="space-y-3 pt-6 border-t border-zinc-200 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-500" /> Security Status (Live From Server)
        </p>
        {!data ? (
          <div className="skeleton h-40 rounded-2xl" />
        ) : (
          <ul className="space-y-2">
            <StatusRow
              ok={!data.security.demoLogin}
              title={data.security.demoLogin ? "Demo login is ON" : "Demo login is off"}
              detail={
                data.security.demoLogin
                  ? "Anyone can sign in as demo accounts. The demo admin is read-only, but turn this off for a real school: remove DEMO_LOGIN_ENABLED in Cloudflare Variables."
                  : "Only real accounts can sign in."
              }
            />
            <StatusRow
              ok
              title="Sign-in tokens verified on every request"
              detail="Google/Firebase sign-ins are checked with Google’s keys; suspended accounts are blocked immediately."
            />
            <StatusRow
              ok
              title="Rate limits active"
              detail="300 API calls/min per person, 20/min for AI, uploads, and support emails."
            />
            <StatusRow
              ok
              title="Uploads strictly validated"
              detail="Only approved documents, images, audio, and video; executable scripts are blocked."
            />
            <StatusRow
              ok={data.security.credentialSigning}
              title={data.security.credentialSigning ? "Credentials are digitally signed" : "Credential signing key missing"}
              detail={
                data.security.credentialSigning
                  ? "Issued blockchain-anchored credentials can be verified by anyone."
                  : "Set CREDENTIAL_SIGNING_PRIVATE_KEY to issue verifiable credentials."
              }
            />
            <StatusRow
              ok={data.security.email}
              title={data.security.email ? "Email notifications active" : "Email notifications optional"}
              detail={data.security.email ? "Dispatched through Resend." : "Push notifications and in-app alerts are active."}
            />
            <StatusRow
              ok={data.security.suspendedAccounts === 0}
              neutral
              title={`${data.security.suspendedAccounts} suspended account${data.security.suspendedAccounts === 1 ? "" : "s"}`}
              detail="Suspended users are immediately blocked from all authenticated endpoints."
            />
            <StatusRow
              ok
              title="Staff verification workflow"
              detail="Teacher and NGO registrations require administrator approval before role elevation."
            />
          </ul>
        )}
        <div className="pt-2">
          <Link href="/admin/audit" className="inline-flex items-center gap-1.5 text-sm font-semibold text-tint-text">
            See who changed what in the Activity Log →
          </Link>
        </div>
      </div>
    </div>
  );
}
