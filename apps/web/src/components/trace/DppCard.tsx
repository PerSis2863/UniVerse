import { FileCheck2, Leaf, Recycle, Wrench } from 'lucide-react';
import type { Dpp } from '@/lib/dpp';

// The EU Digital Product Passport on a public page (M108): the unit's passport (/t/<code>) and the
// product's (/dpp?g=<GTIN>). Drawn in the passport's dark style; the longer texts open on a tap
// (<details>, so it works without script and with a keyboard). The JSON link is for customs, shops
// and recyclers' systems.

const pct = (n: number | null) => (n === null ? null : `${n}%`);

export function DppCard({ dpp, gtin, className = 'mt-4' }: { dpp: Dpp; gtin: string | null; className?: string }) {
  const facts: [string, string | null][] = [
    ['Made in', dpp.madeIn],
    ['Made by', dpp.manufacturer.name],
    ['Carbon footprint', dpp.carbonKg === null ? null : `${dpp.carbonKg} kg CO₂e each`],
    ['Recycled content', pct(dpp.recycledContent)],
    ['Recyclable', pct(dpp.recyclable)],
    ['Made to last', dpp.durabilityYears === null ? null : `${dpp.durabilityYears} years`],
    ['Repair score', dpp.repairScore === null ? null : `${dpp.repairScore} / 10`],
    ['Spare parts', dpp.spareYears === null ? null : `for ${dpp.spareYears} years`],
  ];
  const texts: [string, string | null, typeof Leaf][] = [['Care and use', dpp.care, Leaf], ['Repair', dpp.repair, Wrench], ['When you’re done with it', dpp.endOfLife, Recycle]];
  return (
    <section className={`passport-card p-5 pp-rise ${className}`} aria-labelledby="dpp-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="dpp-h" className="font-bold flex items-center gap-2"><FileCheck2 className="w-4 h-4 text-pink-300" aria-hidden />Digital Product Passport</h2>
        {gtin && <span className="font-mono text-[11px] text-zinc-400">GTIN {gtin}</span>}
      </div>
      <p className="mt-1 text-xs text-zinc-400">What it’s made of, where, its footprint and how to care for it, repair it and recycle it, as the brand declares it (EU Ecodesign rules).</p>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        {facts.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="rounded-xl bg-white/[0.05] px-3 py-2"><dt className="text-zinc-400">{k}</dt><dd className="mt-0.5 font-semibold text-white" translate={k === 'Made by' ? 'no' : undefined}>{v}</dd></div>
        ))}
      </dl>
      {dpp.carbonMethod && <p className="mt-2 text-[11px] text-zinc-400">Footprint worked out with {dpp.carbonMethod}.</p>}

      {dpp.materials.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">Materials</h3>
          <ul className="mt-2 divide-y divide-white/10 text-sm">
            {dpp.materials.map((m, i) => (
              <li key={i} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="font-semibold" translate="no">{m.name}</span>
                {m.percent !== null && <span className="font-mono text-xs text-zinc-300">{m.percent}%</span>}
                {m.recycled !== null && m.recycled > 0 && <span className="text-xs text-emerald-300">{m.recycled}% recycled</span>}
                <span className="ms-auto text-xs text-zinc-400">{[m.origin, m.supplier].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <h3 className="text-sm font-semibold">Substances of concern</h3>
        <p className="mt-1 text-sm text-zinc-300">{dpp.substances.length ? dpp.substances.map((s) => `${s.name}${s.cas ? ` (CAS ${s.cas})` : ''}${s.percent !== null ? `, ${s.percent}%` : ''}`).join('; ') : 'None declared.'}</p>
      </div>

      {texts.filter(([, v]) => v).map(([title, body, Icon]) => (
        <details key={title} className="mt-3 rounded-xl bg-white/[0.05] px-3 py-2 group">
          <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2"><Icon className="w-4 h-4 text-pink-300" aria-hidden />{title}</summary>
          <p className="mt-2 text-sm text-zinc-200 whitespace-pre-wrap">{body}</p>
        </details>
      ))}

      {dpp.certifications.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Certifications">
          {dpp.certifications.map((c) => <li key={c} className="rounded-full bg-white/[0.08] px-2.5 py-1 text-xs">{c}</li>)}
        </ul>
      )}
      {dpp.documents.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm">
          {dpp.documents.map((d) => <li key={d.url}><a href={d.url} target="_blank" rel="noopener noreferrer" className="text-pink-200 underline underline-offset-2">{d.title}</a></li>)}
        </ul>
      )}
      {(dpp.manufacturer.address || dpp.manufacturer.website) && (
        <p className="mt-4 text-xs text-zinc-400">{dpp.manufacturer.address}{dpp.manufacturer.address && dpp.manufacturer.website ? ' · ' : ''}{dpp.manufacturer.website && <a href={dpp.manufacturer.website} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Website</a>}</p>
      )}
      {gtin && <p className="mt-3 text-[11px] text-zinc-500"><a href={`/api/core/trace/dpp/${gtin}`} className="underline underline-offset-2">The passport as data (JSON)</a></p>}
    </section>
  );
}
