'use client';

import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { Compartment, EditorState, Prec, RangeSet, StateEffect, StateField } from '@codemirror/state';
import { Decoration, gutter, GutterMarker, hoverTooltip, keymap, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { forceLinting, linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { lintScript } from '@/lib/lab/lint';
import { explainScript } from '@/lib/lab/explain';
import { completions, highlight, matlab, matlabIndent } from './matlab-lang';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import type { LangId } from '@/lib/lab/langs';

/** The colours and indentation for a script's language (M466): MATLAB's own; Python's; C++'s (and Rust's, near enough); plain for R and Julia. */
const langExt = (l: LangId) => (l === 'matlab' ? [matlab, matlabIndent] : l === 'python' ? [python()] : l === 'cpp' || l === 'rust' ? [cpp()] : []);

// M389: Hyperion's script editor (CodeMirror 6): colours, line numbers, matching brackets, indentation that follows
// if / for / end, suggestions as you type (functions with a line of help, keywords, the script's variables), find
// and replace (Ctrl+F), many cursors, undo history, the line of an error marked, Ctrl+Enter to run.

// Watch it run (M393): the line the playback is on, and the breakpoints (a dot beside the line number).
const setTraceLine = StateEffect.define<number | null>();
const traceLine = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let d = deco.map(tr.changes);
    for (const e of tr.effects) if (e.is(setTraceLine)) d = e.value === null || e.value > tr.state.doc.lines ? Decoration.none : Decoration.set([Decoration.line({ class: 'cm-trace-line' }).range(tr.state.doc.line(e.value).from)]);
    return d;
  },
  provide: (f) => EditorView.decorations.from(f),
});
const setBreaks = StateEffect.define<number[]>();
const dot = new (class extends GutterMarker { toDOM() { const d = document.createElement('span'); d.className = 'cm-bp-dot'; return d; } })();
const breaks = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(set, tr) {
    let s = set.map(tr.changes);
    for (const e of tr.effects) if (e.is(setBreaks)) s = RangeSet.of(e.value.filter((l) => l >= 1 && l <= tr.state.doc.lines).sort((a, b) => a - b).map((l) => dot.range(tr.state.doc.line(l).from)));
    return s;
  },
});

// Time it (M400): a bar beside each line as long as its share of the slowest line's time.
class Heat extends GutterMarker {
  constructor(readonly level: number, readonly label: string) { super(); }
  eq(o: Heat) { return o.level === this.level && o.label === this.label; }
  toDOM() {
    const d = document.createElement('span');
    d.className = 'cm-heat-bar';
    d.title = this.label;
    d.style.transform = `scaleX(${Math.max(0.06, this.level)})`;
    d.style.opacity = String(0.35 + 0.65 * this.level);
    return d;
  }
}
const setHeat = StateEffect.define<Map<number, { level: number; label: string }> | null>();
const heatField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(set, tr) {
    let s = set.map(tr.changes);
    for (const e of tr.effects) if (e.is(setHeat)) {
      const doc = tr.state.doc;
      s = !e.value ? RangeSet.empty : RangeSet.of([...e.value].filter(([l]) => l <= doc.lines).sort((a, b) => a[0] - b[0]).map(([l, h]) => new Heat(h.level, h.label).range(doc.line(l).from)));
    }
    return s;
  },
});
const heatSpacer = new Heat(1, '');

// Explain (M399): what each line does, in plain words under it (a block widget per line, indented like the code).
class Note extends WidgetType {
  constructor(readonly text: string, readonly indent: number) { super(); }
  eq(o: Note) { return o.text === this.text && o.indent === this.indent; }
  toDOM() { const d = document.createElement('div'); d.className = 'cm-explain'; d.style.paddingInlineStart = `calc(${this.indent}ch + 6px)`; d.textContent = this.text; return d; }
  ignoreEvent() { return true; }
}
const setNotes = StateEffect.define<Map<number, string> | null>();
const notes = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let d = deco.map(tr.changes);
    for (const e of tr.effects) if (e.is(setNotes)) {
      const doc = tr.state.doc;
      d = !e.value ? Decoration.none : Decoration.set([...e.value].filter(([l]) => l <= doc.lines).sort((a, b) => a[0] - b[0]).map(([l, t]) => {
        const line = doc.line(l);
        return Decoration.widget({ widget: new Note(t, /^\s*/.exec(line.text)![0].length), block: true, side: 1 }).range(line.to);
      }));
    }
    return d;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** The explanations worked out again (null: Explain is off). Code that can't be read keeps the last ones. */
function explainNow(v: EditorView, on: boolean, isFn: (n: string) => boolean) {
  if (!on) { v.dispatch({ effects: setNotes.of(null) }); return; }
  const src = v.state.doc.toString(), { prog } = lintScript(src, isFn);
  if (prog) v.dispatch({ effects: setNotes.of(explainScript(src, prog, isFn)) });
}

const look = (dark: boolean) => EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--lab-code, 13px)', backgroundColor: 'transparent', color: dark ? '#e4e4e7' : '#18181b' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', lineHeight: '1.65' },
  '.cm-content': { padding: '10px 0', caretColor: dark ? '#e4e4e7' : '#18181b' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: dark ? '#8b8b94' : '#71717a' },
  '.cm-activeLine': { backgroundColor: dark ? 'rgba(255,255,255,0.045)' : 'rgba(24,24,27,0.035)', borderRadius: '6px' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: dark ? '#e4e4e7' : '#18181b' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor': { borderLeftColor: dark ? '#e4e4e7' : '#18181b', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: dark ? 'rgba(139,92,246,0.35)' : 'rgba(139,92,246,0.22)' },
  '.cm-matchingBracket': { backgroundColor: dark ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.18)', outline: 'none' },
  '.cm-tooltip': { border: `1px solid ${dark ? '#3f3f46' : '#e4e4e7'}`, borderRadius: '10px', backgroundColor: dark ? '#1b1d22' : '#ffffff', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: dark ? '#4c1d95' : '#ede9fe', color: dark ? '#fff' : '#18181b' },
  '.cm-completionInfo': { padding: '6px 10px', maxWidth: '22rem', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '12px' },
  '.cm-panels': { backgroundColor: dark ? '#1b1d22' : '#fafafa', color: 'inherit', borderColor: dark ? '#3f3f46' : '#e4e4e7' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button': { fontSize: '12px' },
  '.cm-diagnostic-error': { borderLeftColor: '#dc2626' },
  '.cm-trace-line': { backgroundColor: dark ? 'rgba(139,92,246,0.22)' : 'rgba(139,92,246,0.13)', boxShadow: `inset 3px 0 0 ${dark ? '#a78bfa' : '#7c3aed'}` },
  '.cm-breakpoints': { width: '14px', cursor: 'pointer' },
  '.cm-breakpoints .cm-gutterElement': { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  '.cm-bp-dot': { width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#dc2626' },
  '.cm-lab-help': { padding: '6px 10px', maxWidth: '24rem', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '12px', lineHeight: '1.5' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy #dc2626', textUnderlineOffset: '3px' },
  '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline wavy #d97706', textUnderlineOffset: '3px' },
  '.cm-lintRange-info': { backgroundImage: 'none', textDecoration: `underline dotted ${dark ? '#a78bfa' : '#7c3aed'}`, textUnderlineOffset: '3px' },
  '.cm-diagnostic': { fontFamily: 'Inter, system-ui, sans-serif', fontSize: '12px', lineHeight: '1.5', maxWidth: '26rem', whiteSpace: 'normal' },
  '.cm-diagnosticAction': { backgroundColor: dark ? '#7c3aed' : '#6d28d9', borderRadius: '6px', padding: '1px 8px', fontSize: '12px' },
  '.cm-heat': { width: '34px' },
  '.cm-heat .cm-gutterElement': { display: 'flex', alignItems: 'center', paddingInlineEnd: '4px' },
  '.cm-heat-bar': { display: 'block', width: '28px', height: '6px', borderRadius: '3px', backgroundColor: dark ? '#f87171' : '#dc2626', transformOrigin: 'left center' },
  '.cm-explain': { fontFamily: 'Inter, system-ui, sans-serif', fontSize: '12px', lineHeight: '1.45', color: dark ? '#a1a1aa' : '#52525b', fontStyle: 'italic', paddingBlock: '0 3px', whiteSpace: 'normal' },
}, { dark });

const NONE: number[] = [];

export function LabEditor({ language = 'matlab', value, onChange, onRun, dark, label, vars, describe, error, namesVersion, traceAt = null, breakpoints = NONE, onToggleBreak, isFn, explain = false, heat = null, jump = null }: {
  /** The script's language (M466): MATLAB gets the checker, Explain and the engine's suggestions; the others colours only. */
  language?: LangId;
  value: string;
  onChange: (code: string) => void;
  onRun: () => void;
  dark: boolean;
  label: string;
  /** The workspace's variable names (suggested as you type). */
  vars: string[];
  /** A function's one line of help, for the suggestions. */
  describe: (name: string) => string | undefined;
  /** The line (from 1) and message of the last run's error, or null. */
  error: { line: number; message: string } | null;
  /** Changes when the engine's function names arrive (the colours are worked out again). */
  namesVersion: number;
  /** Watch it run: the line the playback is on (null: not watching). */
  traceAt?: number | null;
  /** Lines with a breakpoint, and what a click beside a line number does. */
  breakpoints?: number[];
  onToggleBreak?: (line: number) => void;
  /** Whether a name is a function (the checker and the explanations; M399). */
  isFn: (name: string) => boolean;
  /** Explain: what each line does, under it. */
  explain?: boolean;
  /** Time it: each line's share of the slowest line (0–1) and its time, as a bar beside it (null: none). */
  heat?: Map<number, { level: number; label: string }> | null;
  /** A line to bring into view and put the cursor on (n changes for each request). */
  jump?: { line: number; n: number } | null;
}) {
  const host = useRef<HTMLDivElement>(null), view = useRef<EditorView | null>(null);
  const slots = useRef({ theme: new Compartment(), lang: new Compartment(), label: new Compartment(), wrap: new Compartment() });
  const live = useRef({ onChange, onRun, vars, describe, onToggleBreak, isFn, error, explain, language });
  const first = useRef({ value, dark, label });
  useEffect(() => { live.current = { onChange, onRun, vars, describe, onToggleBreak, isFn, error, explain, language }; });

  // The editor is made once; later props reach it through the effects below.
  useEffect(() => {
    const s = slots.current, { value: doc, dark: night, label: name } = first.current;
    // Explain keeps up with the typing, a moment after it stops.
    const explainer = ViewPlugin.fromClass(class {
      timer = 0;
      constructor(readonly v: EditorView) {}
      update(u: ViewUpdate) { if (!u.docChanged || !live.current.explain) return; clearTimeout(this.timer); this.timer = window.setTimeout(() => explainNow(this.v, live.current.explain, live.current.isFn), 400); }
      destroy() { clearTimeout(this.timer); }
    });
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc,
        extensions: [
          basicSetup,
          // Ctrl / Cmd + Enter runs (before CodeMirror's own "insert a blank line").
          Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { live.current.onRun(); return true; } }])),
          keymap.of([indentWithTab]),
          s.lang.of(langExt(live.current.language)),
          matlab.data.of({ autocomplete: completions(() => live.current.vars, (n) => live.current.describe(n)) }),
          lintGutter(),
          // The checker (M399): a moment after typing stops, what a careful reader would point out, fixes included;
          // the last run's error stays on its line until the code changes.
          linter((v) => {
            const doc = v.state.doc, src = doc.toString(), out: Diagnostic[] = [];
            for (const p of live.current.language === 'matlab' ? lintScript(src, live.current.isFn).problems : []) {
              const fix = p.fix, d: Diagnostic = { from: p.from, to: Math.min(p.to, doc.length), severity: p.severity, message: p.message };
              if (fix) d.actions = [{ name: fix.label, apply: (view, from) => view.dispatch({ changes: { from: from + (fix.from - p.from), to: from + (fix.to - p.from), insert: fix.insert } }) }];
              out.push(d);
            }
            const err = live.current.error;
            if (err && err.line >= 1 && err.line <= doc.lines) out.push({ from: doc.line(err.line).from, to: Math.max(doc.line(err.line).from, doc.line(err.line).to), severity: 'error', message: err.message });
            return out;
          }, { delay: 450 }),
          notes,
          explainer,
          heatField,
          gutter({ class: 'cm-heat', markers: (v) => v.state.field(heatField), initialSpacer: () => heatSpacer }),
          s.wrap.of([]),
          traceLine,
          breaks,
          gutter({ class: 'cm-breakpoints', renderEmptyElements: true, markers: (v) => v.state.field(breaks), initialSpacer: () => dot, domEventHandlers: { mousedown: (v, line) => { live.current.onToggleBreak?.(v.state.doc.lineAt(line.from).number); return true; } } }),
          // Help for a function when the pointer rests on its name.
          hoverTooltip((view, pos) => {
            const { from, to, text } = view.state.doc.lineAt(pos);
            let a = pos - from, b = a;
            while (a > 0 && /\w/.test(text[a - 1])) a--;
            while (b < text.length && /\w/.test(text[b])) b++;
            const help = a < b ? live.current.describe(text.slice(a, b)) : undefined;
            if (!help) return null;
            return { pos: from + a, end: Math.min(to, from + b), above: true, create: () => { const dom = document.createElement('div'); dom.className = 'cm-lab-help'; dom.textContent = help; return { dom }; } };
          }, { hoverTime: 350 }),
          s.theme.of([look(night), highlight(night)]),
          s.label.of(EditorView.contentAttributes.of({ 'aria-label': name })),
          EditorView.updateListener.of((u) => { if (u.docChanged) live.current.onChange(u.state.doc.toString()); }),
        ],
      }),
    });
    // The scrolling area is reachable by keyboard (axe: scrollable-region-focusable); the text inside takes the focus.
    v.scrollDOM.tabIndex = -1;
    v.contentDOM.tabIndex = 0;
    view.current = v;
    return () => { v.destroy(); view.current = null; };
  }, []);

  // Code changed from outside (a live control, another script chosen): only the changed middle is replaced.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const now = v.state.doc.toString();
    if (now === value) return;
    let a = 0; while (a < now.length && a < value.length && now[a] === value[a]) a++;
    let b = 0; while (b < now.length - a && b < value.length - a && now[now.length - 1 - b] === value[value.length - 1 - b]) b++;
    v.dispatch({ changes: { from: a, to: now.length - b, insert: value.slice(a, value.length - b) } });
  }, [value]);
  useEffect(() => { view.current?.dispatch({ effects: slots.current.theme.reconfigure([look(dark), highlight(dark)]) }); }, [dark]);
  useEffect(() => { view.current?.dispatch({ effects: slots.current.label.reconfigure(EditorView.contentAttributes.of({ 'aria-label': label })) }); }, [label]);
  useEffect(() => {
    const v = view.current;
    if (!v || !namesVersion) return;
    // The colours are worked out again now that the engine's function names are known.
    v.dispatch({ effects: slots.current.lang.reconfigure([]) });
    v.dispatch({ effects: slots.current.lang.reconfigure(langExt(language)) });
  }, [namesVersion, language]);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const effects: StateEffect<unknown>[] = [setTraceLine.of(traceAt)];
    // The line comes into view when it leaves it (no jump while it is already on screen).
    if (traceAt !== null && traceAt <= v.state.doc.lines) effects.push(EditorView.scrollIntoView(v.state.doc.line(traceAt).from, { y: 'nearest', yMargin: 48 }));
    v.dispatch({ effects });
  }, [traceAt]);
  useEffect(() => { view.current?.dispatch({ effects: setBreaks.of(breakpoints) }); }, [breakpoints]);
  useEffect(() => { view.current?.dispatch({ effects: setHeat.of(heat) }); }, [heat]);
  useEffect(() => {
    const v = view.current;
    if (!v || !jump || jump.line > v.state.doc.lines) return;
    const at = v.state.doc.line(jump.line).from;
    v.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'center' }) });
    v.focus();
  }, [jump]);
  // A new run's error (or none), or the engine's names arriving: check again now.
  useEffect(() => { if (view.current) forceLinting(view.current); }, [error, namesVersion]);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    // While explaining, long lines wrap so every explanation stays in view.
    v.dispatch({ effects: slots.current.wrap.reconfigure(explain ? EditorView.lineWrapping : []) });
    explainNow(v, explain, live.current.isFn);
  }, [explain, namesVersion]);

  return <div ref={host} className="min-h-0 flex-1 overflow-hidden [&_.cm-editor]:h-full" />;
}
