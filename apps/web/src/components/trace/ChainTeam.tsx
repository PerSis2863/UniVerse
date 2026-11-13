'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Check, Copy, Loader2, Store, Trash2, Truck, UserPlus, Warehouse, type LucideIcon } from 'lucide-react';
import { CardHead } from '@/components/ui/CardMenu';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { spring } from '@/lib/motion';
import { HANDLER_ROLES, ROLE_LABEL, ROLE_NOTE, type HandlerRole } from '@/lib/trace-chain';
import { useRouter } from 'next/navigation';

// M173: the brand's supply-chain team (src/server/trace-chain.ts): an invite link per role (warehouse,
// driver, shop); whoever opens it signed in joins, and from then on scanning one of the brand's units
// shows them their role's view (no prices for drivers and warehouses) and lets them record its stops.

const ICON: Record<HandlerRole, LucideIcon> = { WAREHOUSE: Warehouse, DRIVER: Truck, SHOP: Store };
interface Team { handlers: { id: string; role: HandlerRole; since: string; name: string }[]; invites: { code: string; role: HandlerRole; uses: number; createdAt: string }[] }

export function ChainTeam() {
  const { data, mutate } = useSWR<Team>('/trace/team', fetcher);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const link = (code: string) => `${window.location.origin}/trace?join=${code}`;
  const invite = async (role: HandlerRole) => {
    setBusy(role);
    try {
      const r = await api.post<{ code: string }>('/trace/team/invites', { role });
      await navigator.clipboard?.writeText(link(r.data.code)).catch(() => {});
      setCopied(r.data.code);
      toast.success(`Invite link for a ${ROLE_LABEL[role].toLowerCase()} copied`);
      void mutate();
    } catch (e) { toast.error(errorMessage(e, 'Could not make the link.')); } finally { setBusy(null); }
  };
  const copy = async (code: string) => { await navigator.clipboard?.writeText(link(code)).catch(() => {}); setCopied(code); toast.success('Link copied'); };
  const drop = async (path: string, ok: string) => { try { await api.delete(path); toast.success(ok); void mutate(); } catch (e) { toast.error(errorMessage(e, 'Could not remove it.')); } };

  return (
    <section className="panel p-5" aria-label="Supply chain team">
      <CardHead title="Supply chain team" sub="Warehouses, drivers and shops who scan your products. Each sees only what their job needs: drivers and warehouses never see prices." />
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {HANDLER_ROLES.map((role) => {
          const I = ICON[role];
          return (
            <button key={role} type="button" disabled={!!busy} onClick={() => void invite(role)}
              className="group flex items-start gap-3 rounded-2xl border border-zinc-200 p-3 text-start transition-[transform,border-color,background-color] duration-150 hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-60 dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.03]">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-pink-500/10 text-pink-600 dark:text-pink-300">{busy === role ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <I className="h-4 w-4" aria-hidden />}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-white"><UserPlus className="h-3.5 w-3.5" aria-hidden />Invite a {ROLE_LABEL[role].toLowerCase()}</span>
                <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{ROLE_NOTE[role]}</span>
              </span>
            </button>
          );
        })}
      </div>
      {data && data.invites.length > 0 && (
        <ul className="mt-4 space-y-1.5" aria-label="Invite links">
          {data.invites.map((i) => (
            <li key={i.code} className="flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2 text-sm dark:bg-white/[0.03]">
              <span className="font-medium text-zinc-900 dark:text-white">{ROLE_LABEL[i.role]} link</span>
              <span className="font-mono text-xs text-zinc-500">…{i.code.slice(-6)} · used {i.uses}×</span>
              <span className="ms-auto flex gap-1">
                <button type="button" onClick={() => void copy(i.code)} className="btn-ghost btn-sm">{copied === i.code ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}Copy</button>
                <button type="button" onClick={() => void drop(`/trace/team/invites/${i.code}`, 'Link removed: it no longer works')} className="btn-ghost btn-sm" aria-label={`Remove the ${ROLE_LABEL[i.role].toLowerCase()} link`}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-4 divide-y divide-zinc-100 dark:divide-white/[0.06]" aria-label="Your team">
        <AnimatePresence initial={false}>
          {(data?.handlers ?? []).map((h) => {
            const I = ICON[h.role] ?? Truck;
            return (
              <motion.li key={h.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: spring.smooth }} exit={{ opacity: 0, transition: { duration: 0.12 } }} className="flex items-center gap-3 py-2.5">
                <I className="h-4 w-4 text-zinc-500" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900 dark:text-white" translate="no">{h.name}</span>
                <span className="text-xs text-zinc-500">{ROLE_LABEL[h.role]}</span>
                <button type="button" onClick={() => void drop(`/trace/team/${h.id}`, `${h.name} removed`)} className="btn-ghost btn-sm" aria-label={`Remove ${h.name}`}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
              </motion.li>
            );
          })}
        </AnimatePresence>
        {data && data.handlers.length === 0 && <li className="py-3 text-sm text-zinc-500">No one yet. Send an invite link to your warehouse, drivers or shops.</li>}
      </ul>
    </section>
  );
}

/** /trace?join=<code>: someone opened a brand's invite link (signed in): show what they'd join, then join. */
export function JoinTeam() {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('join')?.toUpperCase() ?? null));
  const { data, error } = useSWR<{ brand: { name: string }; role: HandlerRole; already: string | null }>(code ? `/trace/join/${code}` : null, fetcher);
  const [busy, setBusy] = useState(false);
  if (!code) return null;
  const close = () => { setCode(null); router.replace('/trace', { scroll: false }); };
  const join = async () => {
    setBusy(true);
    try { const r = await api.post<{ brand: string; role: HandlerRole }>(`/trace/join/${code}`); toast.success(`You’re a ${ROLE_LABEL[r.data.role].toLowerCase()} for ${r.data.brand}. Scan one of their products to see your view.`); close(); }
    catch (e) { toast.error(errorMessage(e, 'Could not join.')); } finally { setBusy(false); }
  };
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: spring.smooth }} className="panel p-5" aria-live="polite">
      {error ? <p className="text-sm text-zinc-600 dark:text-zinc-300">{errorMessage(error, 'This invite link no longer works.')}</p>
        : !data ? <Loader2 className="h-5 w-5 animate-spin text-pink-500" aria-label="Loading" />
        : (
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-pink-500/10 text-pink-600 dark:text-pink-300">{(() => { const I = ICON[data.role] ?? Truck; return <I className="h-5 w-5" aria-hidden />; })()}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-zinc-900 dark:text-white">Join {data.brand.name} as a {ROLE_LABEL[data.role].toLowerCase()}</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{ROLE_NOTE[data.role]}{data.already ? ` You’re their ${ROLE_LABEL[data.already as HandlerRole]?.toLowerCase() ?? 'team member'} now.` : ''}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={close} className="btn-secondary">Not now</button>
              <button type="button" disabled={busy} onClick={() => void join()} className="btn-primary">{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Join</button>
            </div>
          </div>
        )}
    </motion.section>
  );
}
