'use client';

import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { hoverTooltip, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { completions, highlight, matlab, matlabIndent } from './matlab-lang';

// M389: Hyperion's script editor (CodeMirror 6): colours, line numbers, matching brackets, indentation that follows
// if / for / end, suggestions as you type (functions with a line of help, keywords, the script's variables), find
// and replace (Ctrl+F), many cursors, undo history, the line of an error marked, Ctrl+Enter to run.

const look = (dark: boolean) => EditorView.theme({
  '&': { height: '100%', fontSize: '13px', backgroundColor: 'transparent', color: dark ? '#e4e4e7' : '#18181b' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', lineHeight: '1.65' },
  '.cm-content': { padding: '10px 0', caretColor: dark ? '#e4e4e7' : '#18181b' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: dark ? '#8b8b94' : '#71717a' },
  '.cm-activeLine': { backgroundColor: dark ? 'rgba(255,255,255,0.045)' : 'rgba(24,24,27,0.035)' },
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
  '.cm-lab-help': { padding: '6px 10px', maxWidth: '24rem', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '12px', lineHeight: '1.5' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy #dc2626', textUnderlineOffset: '3px' },
}, { dark });

export function LabEditor({ value, onChange, onRun, dark, label, vars, describe, error, namesVersion }: {
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
}) {
  const host = useRef<HTMLDivElement>(null), view = useRef<EditorView | null>(null);
  const slots = useRef({ theme: new Compartment(), lang: new Compartment(), label: new Compartment() });
  const live = useRef({ onChange, onRun, vars, describe });
  const first = useRef({ value, dark, label });
  useEffect(() => { live.current = { onChange, onRun, vars, describe }; });

  // The editor is made once; later props reach it through the effects below.
  useEffect(() => {
    const s = slots.current, { value: doc, dark: night, label: name } = first.current;
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc,
        extensions: [
          basicSetup,
          // Ctrl / Cmd + Enter runs (before CodeMirror's own "insert a blank line").
          Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { live.current.onRun(); return true; } }])),
          keymap.of([indentWithTab]),
          s.lang.of([matlab, matlabIndent]),
          matlab.data.of({ autocomplete: completions(() => live.current.vars, (n) => live.current.describe(n)) }),
          lintGutter(),
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
    v.dispatch({ effects: slots.current.lang.reconfigure([matlab, matlabIndent]) });
  }, [namesVersion]);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const doc = v.state.doc;
    const diags = error && error.line >= 1 && error.line <= doc.lines ? [{ from: doc.line(error.line).from, to: Math.max(doc.line(error.line).from, doc.line(error.line).to), severity: 'error' as const, message: error.message }] : [];
    v.dispatch(setDiagnostics(v.state, diags));
  }, [error]);

  return <div ref={host} className="min-h-0 flex-1 overflow-hidden [&_.cm-editor]:h-full" />;
}
