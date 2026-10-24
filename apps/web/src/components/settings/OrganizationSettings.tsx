"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, Copy, ExternalLink, Globe2, Key, Loader2, Palette, Save, ShieldCheck, Sparkles } from "lucide-react";
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

type SsoSettings = {
  ssoEnabled: boolean;
  ssoProvider: "MICROSOFT" | "GOOGLE" | "SAML" | null;
  ssoDomain: string | null;
  ssoTenantId: string | null;
  ssoEnforced: boolean;
};

type RetentionSettings = {
  dataRetentionDays: number;
};

const PRESET_COLORS = [
  { name: "Indigo", hex: "#253745" },
  { name: "Crimson", hex: "#e11d48" },
  { name: "Emerald", hex: "#059669" },
  { name: "Amber", hex: "#d97706" },
  { name: "Violet", hex: "#253745" },
  { name: "Sky", hex: "#0284c7" },
  { name: "Slate", hex: "#253745" },
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

  // ── SSO Settings State (Stage 5 · C3) ──
  const { data: ssoData, mutate: mutateSso } = useSWR<SsoSettings>("/api/admin/sso", authedJson);
  const [ssoDraft, setSsoDraft] = useState<{
    ssoEnabled?: boolean;
    ssoProvider?: "MICROSOFT" | "GOOGLE" | "SAML" | null;
    ssoDomain?: string;
    ssoTenantId?: string;
    ssoEnforced?: boolean;
  }>({});
  const [savingSso, setSavingSso] = useState(false);

  const ssoEnabled = ssoDraft.ssoEnabled ?? ssoData?.ssoEnabled ?? false;
  const ssoProvider = ssoDraft.ssoProvider ?? ssoData?.ssoProvider ?? "MICROSOFT";
  const ssoDomain = ssoDraft.ssoDomain ?? ssoData?.ssoDomain ?? "";
  const ssoTenantId = ssoDraft.ssoTenantId ?? ssoData?.ssoTenantId ?? "";
  const ssoEnforced = ssoDraft.ssoEnforced ?? ssoData?.ssoEnforced ?? false;

  const saveSso = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSso(true);
    try {
      await authedJson("/api/admin/sso", {
        method: "PATCH",
        body: JSON.stringify({
          ssoEnabled,
          ssoProvider,
          ssoDomain: ssoDomain.trim() || null,
          ssoTenantId: ssoTenantId.trim() || null,
          ssoEnforced,
        }),
      });
      await mutateSso();
      setSsoDraft({});
      toast.success("Enterprise SSO settings saved!");
    } catch (err) {
      toast.error((err as Error).message || "Could not save SSO settings");
    } finally {
      setSavingSso(false);
    }
  };


  // ── Data Retention State (Stage 5 · C5) ──
  const { data: retentionData, mutate: mutateRetention } = useSWR<RetentionSettings>("/api/compliance/retention", authedJson);
  const [retentionDraft, setRetentionDraft] = useState<number | null>(null);
  const [savingRetention, setSavingRetention] = useState(false);

  const retentionDays = retentionDraft ?? retentionData?.dataRetentionDays ?? 730;

  const saveRetention = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRetention(true);
    try {
      await authedJson("/api/compliance/retention", {
        method: "PATCH",
        body: JSON.stringify({ dataRetentionDays: retentionDays }),
      });
      await mutateRetention();
      setRetentionDraft(null);
      toast.success("Data retention policy updated!");
    } catch (err) {
      toast.error((err as Error).message || "Could not save retention policy");
    } finally {
      setSavingRetention(false);
    }
  };

  const name = draft.name ?? org?.name ?? "";
  const slug = draft.slug ?? org?.slug ?? "";
  const customDomain = draft.customDomain ?? org?.customDomain ?? "";
  const brandColor = draft.brandColor ?? org?.brandColor ?? "#253745";
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
                value={brandColor || "#253745"}
                onChange={(e) => setDraft((d) => ({ ...d, brandColor: e.target.value }))}
                className="w-9 h-9 rounded-xl border border-zinc-200 dark:border-zinc-800 cursor-pointer bg-transparent"
              />
              <input
                type="text"
                aria-label="Color hex"
                value={brandColor || "#253745"}
                onChange={(e) => setDraft((d) => ({ ...d, brandColor: e.target.value }))}
                maxLength={7}
                className="input w-28 font-mono text-xs uppercase"
              />
              <div className="flex items-center gap-1.5 ms-2">
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
              style={{ backgroundColor: brandColor || "#253745" }}
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
                style={{ backgroundColor: brandColor || "#253745" }}
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

      {/* ── Enterprise SSO Form (Stage 5 · C3) ── */}
      <form onSubmit={saveSso} className="p-6 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-xl shadow-xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg text-zinc-900 dark:text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-indigo-500" /> Enterprise Single Sign-On (SSO)
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Allow students and faculty to authenticate directly through your school&apos;s existing identity provider.
            </p>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
            ssoEnabled
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              : "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500"
          }`}>
            {ssoEnabled ? `Active · ${ssoProvider === "MICROSOFT" ? "Microsoft Entra ID" : ssoProvider === "GOOGLE" ? "Google Workspace" : "University SAML"}` : "Disabled"}
          </span>
        </div>

        {/* Enable / Disable Toggle */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/60 dark:border-zinc-800">
          <div>
            <p className="font-semibold text-sm text-zinc-900 dark:text-white">Enable Institutional SSO</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              When enabled, users with matching institutional emails or visiting your subdomain can log in with one click.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={ssoEnabled}
            onClick={() => setSsoDraft((d) => ({ ...d, ssoEnabled: !ssoEnabled }))}
            className={`w-12 h-7 flex items-center rounded-full p-1 transition-colors ${
              ssoEnabled ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-700"
            }`}
          >
            <div className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform ${
              ssoEnabled ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0"
            }`} />
          </button>
        </div>

        {ssoEnabled && (
          <div className="space-y-4 pt-2">
            {/* Identity Provider Selector */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                Identity Provider
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { id: "MICROSOFT", name: "Microsoft Entra ID", desc: "Office 365 / Azure AD" },
                  { id: "GOOGLE", name: "Google Workspace", desc: "Google Classroom / Google EDU" },
                  { id: "SAML", name: "University SAML 2.0", desc: "Shibboleth / Okta / Custom IdP" },
                ].map((p) => {
                  const isSel = ssoProvider === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSsoDraft((d) => ({ ...d, ssoProvider: p.id as "MICROSOFT" | "GOOGLE" | "SAML" }))}
                      className={`p-3.5 rounded-2xl border text-start transition-all ${
                        isSel
                          ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-950 dark:text-indigo-200 shadow-sm"
                          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                      }`}
                    >
                      <p className="font-bold text-sm">{p.name}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{p.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Allowed Domains */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Allowed School Email Domains
              </label>
              <input
                type="text"
                value={ssoDomain}
                onChange={(e) => setSsoDraft((d) => ({ ...d, ssoDomain: e.target.value }))}
                placeholder="riverside.edu, students.riverside.edu"
                className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-2.5 text-sm font-medium focus:border-indigo-500 focus:outline-none"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Comma-separated email domains. Users with these email addresses will be recognized for institutional sign-in.
              </p>
            </div>

            {/* Tenant ID / Entity ID */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                {ssoProvider === "MICROSOFT" ? "Microsoft Directory (Tenant) ID" : ssoProvider === "SAML" ? "SAML Entity ID / Provider URI" : "OAuth Client / Domain ID"}
              </label>
              <input
                type="text"
                value={ssoTenantId}
                onChange={(e) => setSsoDraft((d) => ({ ...d, ssoTenantId: e.target.value }))}
                placeholder={ssoProvider === "MICROSOFT" ? "common, organizations, or Azure Directory ID" : "https://idp.school.edu/saml2"}
                className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-2.5 text-sm font-medium focus:border-indigo-500 focus:outline-none"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                For Microsoft 365 multi-tenant apps, leave as &quot;common&quot; or enter your organization&apos;s specific Azure Tenant ID.
              </p>
            </div>

            {/* Enforce SSO Checkbox */}
            <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/60 dark:border-zinc-800 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ssoEnforced}
                onChange={(e) => setSsoDraft((d) => ({ ...d, ssoEnforced: e.target.checked }))}
                className="mt-0.5 w-4 h-4 accent-indigo-600 rounded"
              />
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">Enforce SSO for matching domains</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  When checked, students and faculty cannot sign up with arbitrary passwords using school email addresses.
                </p>
              </div>
            </label>
          </div>
        )}

        {/* Save SSO button */}
        <div className="flex justify-end pt-2">
          <button type="submit" disabled={savingSso} className="btn-primary">
            {savingSso ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save SSO Configuration
          </button>
        </div>
      </form>

      {/* ── Institutional Data Retention Policy (Stage 5 · C5) ── */}
      <form onSubmit={saveRetention} className="p-6 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-xl shadow-xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg text-zinc-900 dark:text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-500" /> Institutional Data Retention Policy
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Configure automated retention and purge schedules for student logs, temporary files, and historical activity in compliance with the India DPDP Act 2023 and FERPA.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
            {retentionDays === 0 ? "Indefinite Archive" : `${retentionDays} Days Retention`}
          </span>
        </div>

        <div className="space-y-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Data Retention Window
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { days: 365, label: "1 Academic Year", desc: "365 days · Minimum audit window" },
              { days: 730, label: "2 Academic Years", desc: "730 days · Recommended baseline" },
              { days: 1095, label: "3 Academic Years", desc: "1,095 days · Standard undergraduate cycle" },
              { days: 1825, label: "5 Years", desc: "1,825 days · Extended institutional archive" },
              { days: 2555, label: "7 Years", desc: "2,555 days · Statutory finance & degree audit" },
              { days: 0, label: "Indefinite", desc: "Permanent archive · Manual purge only" },
            ].map((opt) => {
              const isSel = retentionDays === opt.days;
              return (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => setRetentionDraft(opt.days)}
                  className={`p-3.5 rounded-2xl border text-start transition-all ${
                    isSel
                      ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-950 dark:text-indigo-200 shadow-sm"
                      : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                  }`}
                >
                  <p className="font-bold text-sm">{opt.label}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-between items-center pt-2">
          <p className="text-xs text-zinc-500">
            Records older than the specified retention window will be queued for automated purging in accordance with statutory requirements.
          </p>
          <button type="submit" disabled={savingRetention} className="btn-primary">
            {savingRetention ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Retention Policy
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
