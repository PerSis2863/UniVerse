'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import { Link2, RotateCcw, X } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Arranger, type Bridge } from '@/lib/arrange-dom';
import { MENU_PINS, Vault, cleanKey, cleanPin, pagePins, sameDoc, type Doc, type Pin } from '@/lib/arrange';
import { api } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { useArrange } from '@/store/arrange';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

// M165: every page of the app can be rearranged with the mouse alone (src/lib/arrange-dom.ts does the
// work): drag a card or a button to move it, pull a card's right or bottom edge to resize it. Nothing
// is drawn and there is no mode. What a person arranged is put back on every visit; once a page was
// changed, the top bar offers to put it back as it was.
// M166: the side menu's entries too (one arrangement per app's menu), and, when the person turns it on
// in Settings, the same arrangement on their other devices (GET/PUT/DELETE /arrange; a change is sent a
// moment after it is made, and a change made elsewhere arrives over the live connection).
// M167: a side menu entry dragged onto the page becomes a shortcut on that page (`PageShortcuts`); a link
// (or anything) dragged from a page onto the side menu becomes an entry there (`MenuPins`), at the height
// it was dropped; a shortcut dragged across moves. They are kept and synced with the rest.

interface Answer { sync: boolean; doc: Doc | null }

/** What a dragged thing would be as a shortcut: its one link on this site, or (from a page, with none) this page. */
function pinFrom(el: HTMLElement, fromPage: boolean): Pin | null {
  const links = (el.matches('a[href]') ? [el] : Array.from(el.querySelectorAll('a[href]'))) as HTMLAnchorElement[];
  const name = (s: string | null | undefined) => cleanKey((s ?? '').replace(/(^|\s)\d+\+?(?=\s|$)/g, ' '));
  if (links.length === 1) {
    let href: string | null = null;
    try { const u = new URL(links[0].href, location.href); if (u.origin === location.origin) href = u.pathname + u.search; } catch { /* not a link of this site */ }
    if (href) return cleanPin({ href, label: links[0].getAttribute('aria-label') || name(el.querySelector('h1, h2, h3, h4')?.textContent) || name(el.innerText || links[0].textContent) });
  }
  // A menu heading that opens a list has no one page to go to.
  if (!fromPage) return null;
  return cleanPin({ href: location.pathname + location.search, label: name(document.querySelector('header h1')?.textContent) || name(document.title) });
}

/** The top bar's "Put this page back" (and the phone title row's): there only on a page (or menu) the person rearranged. */
export function ArrangeButton({ className }: { className?: string }) {
  const arranged = useArrange((s) => s.arranged), reset = useArrange((s) => s.reset);
  if (!arranged) return null;
  return (
    <button type="button" data-arrange-ui onClick={reset} title="Put this page back as it was (Ctrl+Z takes back one change)"
      className={cn('drop-in btn-ghost btn-icon rounded-full', className)}>
      <RotateCcw className="w-[18px] h-[18px]" strokeWidth={2.1} aria-hidden /><span className="sr-only">Put this page back</span>
    </button>
  );
}

export function ArrangeMode() {
  const pathname = usePathname();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const parts = useRef<{ vault: Vault; page: Arranger | null; menu: Arranger | null } | null>(null);
  const { data, mutate } = useSWR<Answer>(userId ? '/arrange' : null, fetcher, { revalidateOnFocus: true, shouldRetryOnError: false });
  const live = useRef({ sync: false, mutate });
  useEffect(() => { live.current = { sync: !!data?.sync, mutate }; }, [data?.sync, mutate]);

  useEffect(() => {
    const vault = new Vault(userId);
    const said = { page: false, menu: false };
    const tell = () => useArrange.setState({
      arranged: said.page || said.menu, any: vault.any(), pins: vault.allPins(),
      // The page first; the menu when only it was changed.
      reset: () => { const p = parts.current; if (said.page) p?.page?.reset(); else p?.menu?.reset(); },
    });
    const main = document.getElementById('main'), nav = document.getElementById('side-nav');
    /** A shortcut put under `to` (taken from `from` when it was one there), once in each list. */
    const movePin = (pin: Pin, from: string | null, to: string) => {
      const lists: Record<string, Pin[]> = { [to]: [...vault.pins(to).filter((p) => p.href !== pin.href), pin] };
      if (from && from !== to) lists[from] = vault.pins(from).filter((p) => p.href !== pin.href);
      vault.setPins(lists);
    };
    const bridge: Bridge = {
      over(from, el, x, y) {
        const aside = nav?.closest('aside');
        if (!aside || !main) return null;
        const a = aside.getBoundingClientRect(), m = main.getBoundingClientRect();
        // Only with the menu beside the page (on a phone it is a sheet over it).
        if (a.width < 48 || a.left < -2 || a.right > m.left + 2) return null;
        const inA = x >= a.left && x < a.right && y >= a.top && y <= a.bottom, inM = x >= m.left && x <= m.right && y >= m.top && y <= m.bottom;
        const here = pagePins(location.pathname);
        if (from === 'menu' && inM) {
          const pin = pinFrom(el, false);
          return pin && (() => movePin(pin, el.dataset.pin !== undefined ? MENU_PINS : null, here));
        }
        if (from === 'page' && inA) {
          const pin = pinFrom(el, true);
          if (!pin) return null;
          const chip = el.closest('[data-page-pins]') ? here : null;
          // A shortcut to a page the menu already lists goes back to it: the shortcut is just taken away.
          const listed = Array.from(nav!.querySelectorAll<HTMLAnchorElement>('a[href]')).some((a) => !a.closest('[data-pin]') && a.getAttribute('href') === pin.href);
          if (listed) return chip ? () => vault.setPins({ [chip]: vault.pins(chip).filter((p) => p.href !== pin.href) }) : null;
          return () => { parts.current?.menu?.placeNext(cleanKey(`Shortcut ${pin.label}`), y); movePin(pin, chip, MENU_PINS); };
        }
        return null;
      },
    };
    const page = main ? new Arranger(main, vault, (s) => { said.page = s.arranged; tell(); }, false, bridge) : null;
    const menu = nav ? new Arranger(nav, vault, (s) => { said.menu = s.arranged; tell(); }, true, bridge) : null;
    parts.current = { vault, page, menu };

    // A change made here is sent a moment later (the answer is both copies joined).
    let timer = 0;
    const send = async () => {
      const r = await api.put<Answer>('/arrange', { doc: vault.now() });
      if (r.data.doc) vault.merge(r.data.doc);
      void live.current.mutate(r.data, { revalidate: false });
    };
    const off = vault.listen((_paths, mine) => {
      tell();
      if (!mine || !live.current.sync) return;
      clearTimeout(timer);
      timer = window.setTimeout(() => { void send().catch(() => undefined); }, 1200);
    });
    useArrange.setState({
      resetAll: () => { vault.clearAll(); },
      removePin: (key, href) => vault.setPins({ [key]: vault.pins(key).filter((p) => p.href !== href) }),
      setSync: async (on) => {
        if (on) await send();
        else { clearTimeout(timer); const r = await api.delete<Answer>('/arrange'); void live.current.mutate(r.data, { revalidate: false }); }
      },
    });
    tell();
    return () => {
      // A change still waiting goes now.
      if (timer) { clearTimeout(timer); void send().catch(() => undefined); }
      off(); page?.destroy(); menu?.destroy(); parts.current = null;
      useArrange.setState({ arranged: false, any: false, reset: () => undefined, resetAll: () => undefined, sync: null, setSync: async () => undefined, pins: {}, removePin: () => undefined });
    };
  }, [userId]);

  // The account's copy (first load, a change on another device): joined into this device's; what this
  // device has that the account lacks goes back.
  useEffect(() => {
    useArrange.setState({ sync: data ? data.sync : null });
    const p = parts.current;
    if (!p || !data?.sync || !data.doc) return;
    p.vault.merge(data.doc);
    if (!sameDoc(p.vault.now(), data.doc)) void api.put<Answer>('/arrange', { doc: p.vault.now() }).then((r) => live.current.mutate(r.data, { revalidate: false })).catch(() => undefined);
  }, [data, userId]);

  useEffect(() => {
    const p = parts.current;
    p?.page?.setPath(pathname);
    // One arrangement per app's menu (`data-arrange-scope` on the side menu).
    p?.menu?.setPath(`/~menu/${document.getElementById('side-nav')?.dataset.arrangeScope ?? 'all'}`);
  }, [pathname, userId]);
  return null;
}

/** M167: the shortcuts a person dragged onto the side menu, after its own entries (moved like them). */
export function MenuPins({ onClose }: { onClose?: () => void }) {
  const pins = useArrange((s) => s.pins[MENU_PINS]), remove = useArrange((s) => s.removePin);
  const pathname = usePathname();
  if (!pins?.length) return null;
  return pins.map((p) => (
    <div key={p.href} data-pin={p.href} data-arrange-key={`Shortcut ${p.label}`} className="drop-in group/pin relative">
      <Link href={p.href} onClick={onClose} className={cn('sidebar-item glide-host relative pe-9', pathname === p.href.split('?')[0] && 'active')}>
        <span className="relative flex items-center gap-3 min-w-0">
          <Link2 className="w-[18px] h-[18px] flex-shrink-0 text-tint-text" strokeWidth={2} aria-hidden />
          <span className="side-label truncate" translate="no">{p.label}</span>
        </span>
      </Link>
      <button type="button" data-no-arrange onClick={() => remove(MENU_PINS, p.href)} title="Remove this shortcut"
        className="side-label absolute end-1.5 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-md text-zinc-500 dark:text-zinc-400 opacity-0 group-hover/pin:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:bg-[var(--fill)] transition-opacity">
        <X className="w-3.5 h-3.5" aria-hidden /><span className="sr-only">Remove the shortcut {p.label}</span>
      </button>
    </div>
  ));
}

/** M167: the shortcuts a person dragged onto this page from the side menu, above its content. */
export function PageShortcuts() {
  const pathname = usePathname(), key = pagePins(pathname);
  const pins = useArrange((s) => s.pins[key]), remove = useArrange((s) => s.removePin);
  if (!pins?.length) return null;
  return (
    <div data-page-pins className="flex flex-wrap gap-2 mx-4 md:mx-6 lg:mx-8 mt-4 md:mt-6 -mb-1">
      {pins.map((p) => (
        <span key={p.href} data-pin={p.href} data-card data-arrange-key={`Shortcut ${p.label}`} className="drop-in inline-flex items-center rounded-full border border-[var(--hairline)] bg-[var(--surface)] text-sm shadow-sm">
          <Link href={p.href} className="inline-flex items-center gap-1.5 ps-3 pe-1 py-1.5 rounded-full font-medium text-zinc-800 dark:text-zinc-100 hover:text-tint-text">
            <Link2 className="w-3.5 h-3.5 text-tint-text" aria-hidden /><span translate="no">{p.label}</span>
          </Link>
          <button type="button" data-no-arrange onClick={() => remove(key, p.href)} title="Remove this shortcut" className="me-1 w-7 h-7 grid place-items-center rounded-full text-zinc-500 dark:text-zinc-400 hover:bg-[var(--fill)]">
            <X className="w-3.5 h-3.5" aria-hidden /><span className="sr-only">Remove the shortcut {p.label}</span>
          </button>
        </span>
      ))}
    </div>
  );
}
