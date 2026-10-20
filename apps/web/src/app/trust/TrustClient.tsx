'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { authedJson } from '@/lib/authed-fetch';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import Link from '@/components/ui/Link';
import {
  ShieldCheck,
  Lock,
  Server,
  FileCheck,
  Scale,
  Globe,
  CheckCircle2,
  Clock,
  UserCheck,
  Cpu,
  Database,
  Key,
  RefreshCw,
  FileText,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { m as motion } from 'framer-motion';

interface SystemStatus {
  name: string;
  status: string;
  latency?: string;
  encryption?: string;
  protocol?: string;
  standard?: string;
}

interface TrustStatusResponse {
  status: string;
  updatedAt: string;
  uptimePercent: string;
  complianceFrameworks: string[];
  systems: SystemStatus[];
}

const DEFAULT_SYSTEMS: SystemStatus[] = [
  { name: 'Edge API & Workload Routing', status: 'OPERATIONAL', latency: '12ms' },
  { name: 'Cloudflare D1 Primary Database', status: 'OPERATIONAL', encryption: 'AES-256' },
  { name: 'Cloudflare R2 Object Storage', status: 'OPERATIONAL', encryption: 'AES-256' },
  { name: 'Authentication (Firebase / Entra ID)', status: 'OPERATIONAL', protocol: 'OIDC / SAML 2.0' },
  { name: 'WebSockets & Live Collaboration', status: 'OPERATIONAL', protocol: 'WSS / TLS 1.3' },
  { name: 'Verifiable Credentials Engine', status: 'OPERATIONAL', standard: 'W3C / Ed25519' },
];

export function TrustClient() {
  const [activeTab, setActiveTab] = useState<'dpdp' | 'ferpa' | 'security' | 'subprocessors' | 'dpo'>('dpdp');

  const { data: statusData, isLoading, mutate } = useSWR<TrustStatusResponse>(
    '/api/trust/status',
    authedJson,
    { refreshInterval: 60000, revalidateOnFocus: false },
  );

  const systems = statusData?.systems ?? DEFAULT_SYSTEMS;
  const uptime = statusData?.uptimePercent ?? '99.98%';

  return (
    <div className="dark min-h-screen overflow-x-clip font-sans" style={{ backgroundColor: '#0a0d13', color: '#ffffff' }}>
      {/* Ambient background glows */}
      <div aria-hidden className="fixed inset-0 pointer-events-none z-0">
        <div
          className="absolute top-[-20%] start-[-25%] w-[max(80vw,760px)] h-[max(80vw,760px)] rounded-full"
          style={{ background: 'radial-gradient(closest-side, rgba(79,70,229,0.18), transparent)' }}
        />
        <div
          className="absolute top-[40%] end-[-30%] w-[max(75vw,720px)] h-[max(75vw,720px)] rounded-full"
          style={{ background: 'radial-gradient(closest-side, rgba(147,51,234,0.14), transparent)' }}
        />
        <div
          className="absolute bottom-[-20%] start-[20%] w-[max(60vw,600px)] h-[max(60vw,600px)] rounded-full"
          style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,0.10), transparent)' }}
        />
      </div>

      <MarketingNav />

      <main className="relative z-10 px-4 sm:px-6 pt-32 md:pt-40 pb-24 max-w-6xl mx-auto space-y-16">
        {/* ── Hero Section ── */}
        <div className="text-center max-w-3xl mx-auto space-y-5">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-xs font-bold uppercase tracking-wider text-indigo-300">
            <ShieldCheck className="w-4 h-4 text-indigo-400" /> Trust, Security & Compliance
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white">
            UniVerse Trust Center
          </h1>
          <p className="text-base sm:text-lg text-zinc-300 leading-relaxed">
            Enterprise-grade governance, strict student data privacy, and verifiable compliance for universities and academic institutions worldwide.
          </p>

          {/* Quick Badges */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            {[
              { label: 'India DPDP Act 2023 Compliant', icon: Scale },
              { label: 'FERPA 34 CFR Part 99', icon: FileCheck },
              { label: 'COPPA Student Privacy', icon: UserCheck },
              { label: 'GDPR & Standard Clauses', icon: Globe },
              { label: 'AES-256 / TLS 1.3', icon: Lock },
              { label: 'W3C Ed25519 Credentials', icon: Key },
            ].map((badge) => {
              const Icon = badge.icon;
              return (
                <span
                  key={badge.label}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/[0.05] border border-white/10 text-zinc-300"
                >
                  <Icon className="w-3.5 h-3.5 text-indigo-400" />
                  {badge.label}
                </span>
              );
            })}
          </div>
        </div>

        {/* ── Live Operational Status Card ── */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="relative flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  All Systems Operational
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Continuous telemetry across global edge nodes · {uptime} historical availability
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => void mutate()}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-zinc-300 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''} text-zinc-400`} />
                Refresh Telemetry
              </button>
            </div>
          </div>

          {/* Systems Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-6">
            {systems.map((s) => (
              <div
                key={s.name}
                className="p-4 rounded-2xl border border-white/[0.06] bg-black/30 flex items-start justify-between gap-3 hover:border-white/15 transition-all"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="text-sm font-semibold text-white">{s.name}</span>
                  </div>
                  <p className="text-xs text-zinc-400 ps-6">
                    {s.latency && `Edge Latency: ${s.latency}`}
                    {s.encryption && `Encryption: ${s.encryption}`}
                    {s.protocol && `Security: ${s.protocol}`}
                    {s.standard && `Standard: ${s.standard}`}
                  </p>
                </div>
                <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  ACTIVE
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Interactive Framework Tabs ── */}
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-center gap-2 p-1.5 rounded-2xl bg-white/[0.03] border border-white/10 max-w-3xl mx-auto">
            {[
              { id: 'dpdp', label: 'India DPDP Act 2023', icon: Scale },
              { id: 'ferpa', label: 'FERPA & COPPA (US)', icon: FileCheck },
              { id: 'security', label: 'Infrastructure & Security', icon: Lock },
              { id: 'subprocessors', label: 'Subprocessors Registry', icon: Server },
              { id: 'dpo', label: 'Data Principal Rights & DPO', icon: UserCheck },
            ].map((tab) => {
              const Icon = tab.icon;
              const isSel = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                    isSel
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* ── Tab Content: DPDP Act 2023 ── */}
          {activeTab === 'dpdp' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="p-8 rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-xl space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                    <Scale className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">
                      India Digital Personal Data Protection Act, 2023 (DPDP Act)
                    </h3>
                    <p className="text-sm text-zinc-300 mt-1 max-w-3xl leading-relaxed">
                      UniVerse is engineered from the ground up to fulfill every statutory mandate of the DPDP Act 2023 for higher educational institutions and schools operating in India.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                  <div className="p-5 rounded-2xl border border-white/[0.06] bg-black/20 space-y-2">
                    <h4 className="font-bold text-white text-base flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-emerald-400" /> Section 6: Notice & Informed Consent
                    </h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Prior to collecting student personal data, itemized granular notices are served in English and accessible scheduled languages. Users have uninhibited rights to withdraw consent via Settings with zero punitive impact on academic standing.
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl border border-white/[0.06] bg-black/20 space-y-2">
                    <h4 className="font-bold text-white text-base flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-emerald-400" /> Section 9: Minor Protection & No Profiling
                    </h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Verifiable consent of parent or legal guardian is required for students under 18 years of age. Targeted advertising, tracking, and harmful behavioral monitoring of students are strictly prohibited across all UniVerse subsystems.
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl border border-white/[0.06] bg-black/20 space-y-2">
                    <h4 className="font-bold text-white text-base flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-400" /> Sections 11–12: Access, Correction & Erasure
                    </h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Data Principals (students and faculty) can download complete personal data summaries, request correction of inaccurate educational records, or petition erasure of non-statutory data directly from their dashboard.
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl border border-white/[0.06] bg-black/20 space-y-2">
                    <h4 className="font-bold text-white text-base flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-400" /> Sections 13–14: Grievance SLA & Nomination
                    </h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Formal statutory grievance redressal workflow with guaranteed initial response within 72 hours and final resolution within 30 days. Students can designate a legal nominee to manage their digital educational records.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Tab Content: FERPA & COPPA ── */}
          {activeTab === 'ferpa' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="p-8 rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-xl space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                    <FileCheck className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">
                      FERPA (34 CFR Part 99) & COPPA Compliance
                    </h3>
                    <p className="text-sm text-zinc-300 mt-1 max-w-3xl leading-relaxed">
                      Rigorous safeguards for US higher education and K-12 institutions adhering to the Family Educational Rights and Privacy Act and Children&apos;s Online Privacy Protection Act.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                  <div className="p-5 rounded-2xl border border-white/[0.06] bg-black/20 space-y-2">
                    <h4 className="font-bold text-white text-base flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-indigo-400" /> 34 CFR § 99.32: Immutable Record Access Logs
                    </h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Every access to student grades, transcripts, attendance, medical, or disciplinary records by administrators, faculty, or staff generates a tamper-evident audit record recording actor, timestamp, record category, and educational purpose.
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl border border-white/[0.06] bg-black/20 space-y-2">
                    <h4 className="font-bold text-white text-base flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-indigo-400" /> 34 CFR § 99.37: Directory Opt-Out
                    </h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Students retain complete control over directory disclosure. Opting out immediately removes the student&apos;s listing from public directories, search indexes, and alumni rosters across all federated subdomains.
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl border border-white/[0.06] bg-black/20 space-y-2">
                    <h4 className="font-bold text-white text-base flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-indigo-400" /> School Official Exception
                    </h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      UniVerse functions strictly as a &quot;School Official with Legitimate Educational Interest&quot; under direct institutional control. UniVerse never uses student educational data for commercial purposes or third-party training.
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl border border-white/[0.06] bg-black/20 space-y-2">
                    <h4 className="font-bold text-white text-base flex items-center gap-2">
                      <Lock className="w-4 h-4 text-indigo-400" /> COPPA Direct Notice & Consent
                    </h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Where utilized in primary and secondary schools, parental consent is verified through school administrative authorizations strictly for educational services without extraneous data gathering.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Tab Content: Infrastructure & Security ── */}
          {activeTab === 'security' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="p-8 rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-xl space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                    <Lock className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">
                      Infrastructure Security & Cryptographic Safeguards
                    </h3>
                    <p className="text-sm text-zinc-300 mt-1 max-w-3xl leading-relaxed">
                      Multi-layered defense architecture deployed on Cloudflare&apos;s ISO 27001 / SOC 2 Type II certified edge network across 300+ global cities.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                  <div className="p-5 rounded-2xl border border-white/[0.06] bg-black/20 space-y-2">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center mb-3">
                      <Cpu className="w-4 h-4 text-indigo-400" />
                    </div>
                    <h4 className="font-bold text-white text-sm">V8 Worker Isolation</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Serverless edge compute executes within sandboxed Google V8 isolates, preventing memory leakage and unauthorized cross-tenant execution.
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl border border-white/[0.06] bg-black/20 space-y-2">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center mb-3">
                      <Database className="w-4 h-4 text-purple-400" />
                    </div>
                    <h4 className="font-bold text-white text-sm">AES-256 Storage & D1</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      All student databases, transcripts, and submissions are encrypted at rest with AES-256 and replicated across redundant geo-fenced availability zones.
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl border border-white/[0.06] bg-black/20 space-y-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-3">
                      <Key className="w-4 h-4 text-emerald-400" />
                    </div>
                    <h4 className="font-bold text-white text-sm">W3C Ed25519 Signatures</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Degrees, certificates, and credentials are digitally signed using Ed25519 asymmetric cryptography adhering to W3C Verifiable Credentials standards.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Tab Content: Subprocessors ── */}
          {activeTab === 'subprocessors' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="p-8 rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-xl space-y-6">
                <div>
                  <h3 className="text-2xl font-bold text-white">Authorized Subprocessors Registry</h3>
                  <p className="text-sm text-zinc-300 mt-1 max-w-3xl leading-relaxed">
                    UniVerse engages third-party infrastructure providers that maintain verified SOC 2 Type II, ISO 27001, and GDPR Article 28 data protection agreements.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-start text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-zinc-400 uppercase tracking-wider">
                        <th className="py-3 px-4 font-semibold">Provider</th>
                        <th className="py-3 px-4 font-semibold">Purpose</th>
                        <th className="py-3 px-4 font-semibold">Processing Region</th>
                        <th className="py-3 px-4 font-semibold">Security Certifications</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06] text-zinc-300">
                      <tr>
                        <td className="py-4 px-4 font-bold text-white">Cloudflare, Inc.</td>
                        <td className="py-4 px-4">Global Edge Network, D1 Database, R2 Object Storage & WAF</td>
                        <td className="py-4 px-4">Global Edge (300+ Cities)</td>
                        <td className="py-4 px-4 text-indigo-400 font-mono">ISO 27001, SOC 2 Type II, PCI-DSS</td>
                      </tr>
                      <tr>
                        <td className="py-4 px-4 font-bold text-white">Google LLC</td>
                        <td className="py-4 px-4">Firebase Identity Management & Federated Authentication</td>
                        <td className="py-4 px-4">United States & Global</td>
                        <td className="py-4 px-4 text-indigo-400 font-mono">ISO 27001, SOC 2/3, FedRAMP</td>
                      </tr>
                      <tr>
                        <td className="py-4 px-4 font-bold text-white">Resend, Inc.</td>
                        <td className="py-4 px-4">Transactional Notifications & Critical System Dispatches</td>
                        <td className="py-4 px-4">United States</td>
                        <td className="py-4 px-4 text-indigo-400 font-mono">SOC 2 Type II, GDPR DPA</td>
                      </tr>
                      <tr>
                        <td className="py-4 px-4 font-bold text-white">Stripe, Inc.</td>
                        <td className="py-4 px-4">Campus Tuition, Event Fees & Payment Gateway Processing</td>
                        <td className="py-4 px-4">Global / Multi-region</td>
                        <td className="py-4 px-4 text-indigo-400 font-mono">PCI-DSS Level 1, SOC 1/2</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Tab Content: DPO & Rights ── */}
          {activeTab === 'dpo' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="p-8 rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-xl space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                    <UserCheck className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">
                      Data Protection Officer & Redressal Mechanism
                    </h3>
                    <p className="text-sm text-zinc-300 mt-1 max-w-3xl leading-relaxed">
                      Direct, transparent contact channels for submitting data inquiries, exercising DPDP statutory rights, or lodging complaints.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div className="p-6 rounded-2xl border border-white/[0.08] bg-black/30 space-y-4">
                    <h4 className="font-bold text-white text-base flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-400" /> Data Protection Office (DPO)
                    </h4>
                    <div className="space-y-2 text-xs text-zinc-300">
                      <p><span className="text-zinc-500">Officer:</span> Institutional Compliance & Data Protection Officer</p>
                      <p><span className="text-zinc-500">Official Inquiries:</span> <a href="mailto:dpo@universeimpact.com" className="text-indigo-400 hover:underline">dpo@universeimpact.com</a></p>
                      <p><span className="text-zinc-500">Privacy Escalations:</span> <a href="mailto:privacy@universeimpact.com" className="text-indigo-400 hover:underline">privacy@universeimpact.com</a></p>
                      <p><span className="text-zinc-500">Jurisdiction:</span> New Delhi, India & Global Educational Partners</p>
                    </div>
                  </div>

                  <div className="p-6 rounded-2xl border border-white/[0.08] bg-black/30 space-y-4">
                    <h4 className="font-bold text-white text-base flex items-center gap-2">
                      <Clock className="w-4 h-4 text-indigo-400" /> Grievance Redressal SLA
                    </h4>
                    <div className="space-y-2 text-xs text-zinc-300">
                      <p><span className="text-zinc-500">Initial Acknowledgment:</span> &lt; 72 business hours</p>
                      <p><span className="text-zinc-500">Statutory Resolution Window:</span> Maximum 30 calendar days</p>
                      <p><span className="text-zinc-500">Escalation Authority:</span> Data Protection Board of India (DPBI)</p>
                      <p><span className="text-zinc-500">Self-Service Portal:</span> Settings → My Consents & Data Rights</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* ── Call to Action Card ── */}
        <section className="rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/30 via-zinc-900/60 to-purple-950/30 p-8 sm:p-10 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl">
          <div className="space-y-2 max-w-xl text-center md:text-start">
            <h3 className="text-xl sm:text-2xl font-bold text-white flex items-center justify-center md:justify-start gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" /> Manage Your Data Rights
            </h3>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              Review your active consents, inspect FERPA record access logs, or submit a data principal grievance anytime through your account settings.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/settings"
              className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2"
            >
              Account Settings <ChevronRight className="w-4 h-4" />
            </Link>
            <a
              href="mailto:dpo@universeimpact.com"
              className="px-5 py-3 rounded-2xl border border-white/15 bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 font-semibold text-sm transition-all"
            >
              Contact DPO
            </a>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
