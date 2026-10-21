'use client';

import { useEffect } from 'react';
import { useLanguageStore } from '@/store/language';
import { languageInfo, type Language } from '@/lib/i18n';
import { compile, translateText, type Chunk, type Dictionary } from '@/lib/ui-dictionary';
import { applyLanguage, RTL_LANGUAGES } from '@/lib/language-script';

// Shows the app's screens in the chosen language (Stage 5 · Q21): after React has drawn the page,
// English text, labels and placeholders that are in the language's dictionary (drafted by the AI
// translator, Owner console → Languages) are swapped for their translation, and so is anything
// drawn later (a MutationObserver). Only the text itself changes, never the page's structure, so
// React keeps working. People's own content is left alone: anything inside translate="no" or
// contenteditable, form fields' values, code. Without a dictionary yet, the screens stay English.

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'KBD', 'SAMP', 'NOSCRIPT', 'SVG', 'MATH']);
const store = (lang: string) => `uv-ui-dict:${lang}`;

type Saved = { v: string; chunks: Chunk[] };
const readSaved = (lang: string): Saved | null => {
  try {
    const raw = localStorage.getItem(store(lang));
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
};

/** Whether this node is people's own content (or code) rather than the app's screens. */
function skipped(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (SKIP.has(e.tagName.toUpperCase()) || e.getAttribute('translate') === 'no' || (e as HTMLElement).isContentEditable) return true;
  }
  return false;
}

function translator(dict: Dictionary) {
  const shown = new WeakMap<Text, string>(); // what we wrote, so our own change isn't redone
  const attrShown = new WeakMap<Element, Record<string, string>>();
  const text = (n: Text) => {
    const now = n.nodeValue ?? '';
    if (shown.get(n) === now) return;
    if (skipped(n.parentElement)) return;
    const t = translateText(dict, now);
    if (t === null || t === now) return;
    shown.set(n, t);
    n.nodeValue = t;
  };
  const attrs = (el: Element) => {
    if (skipped(el)) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v) continue;
      const before = attrShown.get(el);
      if (before?.[a] === v) continue;
      const t = translateText(dict, v);
      if (t === null || t === v) continue;
      attrShown.set(el, { ...before, [a]: t });
      el.setAttribute(a, t);
    }
  };
  const walk = (root: Node) => {
    if (root.nodeType === Node.TEXT_NODE) return text(root as Text);
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const el = root as Element;
    if (skipped(el)) return;
    attrs(el);
    el.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(',')).forEach(attrs);
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) text(n as Text);
  };
  return { walk, text, attrs };
}

// The language the page is shown in; switching after that reloads, which brings the English back first.
let applied: string | null = null;

export default function UiTranslator() {
  const language = useLanguageStore((s) => s.language) as Language;

  useEffect(() => {
    if (applied && applied !== language) { window.location.reload(); return; }
    if (language === 'en' || typeof MutationObserver === 'undefined') return;
    let observer: MutationObserver | null = null;
    let cancelled = false;
    const start = (saved: Saved) => {
      observer?.disconnect();
      applied = language;
      const t = translator(compile(saved.chunks, languageInfo(language).locale));
      t.walk(document.body);
      observer = new MutationObserver((list) => {
        for (const m of list) {
          if (m.type === 'characterData') t.text(m.target as Text);
          else if (m.type === 'attributes') t.attrs(m.target as Element);
          else m.addedNodes.forEach((n) => t.walk(n));
        }
      });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    };
    // Only once React has finished drawing the page: changing text it hasn't taken over yet makes
    // it redraw everything (a hydration mismatch).
    let saved: Saved | null = null;
    const whenDrawn = (go: () => void) => {
      const idle = () => ((window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 300)))(go, { timeout: 1200 });
      if (document.readyState === 'complete') idle();
      else window.addEventListener('load', idle, { once: true });
    };
    // If the page is redrawn anyway, put the language's direction back.
    const html = document.documentElement;
    const wanted = RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';
    const dir = new MutationObserver(() => { if (html.lang !== language || html.dir !== wanted) applyLanguage(language); });
    whenDrawn(() => {
      if (cancelled) return;
      if (html.lang !== language || html.dir !== wanted) applyLanguage(language);
      dir.observe(html, { attributes: true, attributeFilter: ['dir', 'lang'] });
      saved = readSaved(language);
      if (saved?.chunks?.length) start(saved);
      void refresh();
    });
    // A newer copy, if there is one (the server answers 304 when it hasn't changed).
    const refresh = () => fetch(`/api/i18n/${language}`, { headers: saved?.v ? { 'If-None-Match': saved.v } : {} })
      .then(async (res) => {
        if (cancelled || res.status !== 200) return;
        const fresh = (await res.json()) as Saved;
        try { localStorage.setItem(store(language), JSON.stringify(fresh)); } catch { /* full: still used for this visit */ }
        if (fresh.chunks?.length) start(fresh);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      observer?.disconnect();
      dir.disconnect();
    };
  }, [language]);

  return null;
}
