'use client';

import { useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Diagram } from '@/lib/sim/blocks';
import { generateCode, LANGS, type CodeFile, type Lang } from '@/lib/sim/blockcode';
import { ui } from './bench-ui';

// Hyperion Simulate → Blocks → Code (M565): the diagram as C, C++, Structured Text, Verilog or VHDL, with the program
// or test bench that runs it. Copy a file, or download them all as a ZIP.

const ABOUT: Record<Lang, string> = {
  c: 'C99 in doubles: model.h (the inputs, outputs and kept state), model.c (model_init, model_step), main.c (runs it and prints the outputs). Compile: cc -std=c99 main.c model.c -lm.',
  cpp: 'C++17: one class; set its inputs, call step(), read its outputs. main.cpp runs it.',
  st: 'IEC 61131-3 Structured Text for a PLC: a FUNCTION_BLOCK called once a cycle at the diagram’s time step (put it in a cyclic task with that period).',
  verilog: 'Verilog for an FPGA: signed 32-bit fixed point (16 bits after the point), one step per clock edge with en high. model_tb.v runs it in a simulator (iverilog, then vvp).',
  vhdl: 'VHDL-2008 for an FPGA: the same fixed point as the Verilog, one step per rising edge with en = ‘1’. model_tb.vhd runs it (ghdl -a, -e, -r).',
};
const safe = (s: string) => (/^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(s) ? s : 'model');

export function BlocksCode({ dg }: { dg: Diagram }) {
  const [lang, setLang] = useState<Lang>('c');
  const [name, setName] = useState('model');
  const [pick, setPick] = useState(0);
  const [copied, setCopied] = useState(false);
  let files: CodeFile[] = [], error = '';
  try { files = generateCode(dg, lang, safe(name)); } catch (e) { error = (e as Error).message; }
  const file = files[Math.min(pick, files.length - 1)];
  const download = async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const zip = zipSync(Object.fromEntries(files.map((f) => [f.name, strToU8(f.text)])));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
    a.download = `${safe(name)}-${lang}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className={ui.label}>Language
          <select value={lang} onChange={(e) => { setLang(e.target.value as Lang); setPick(0); }} className="input mt-1 block">{LANGS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        </label>
        <label className={ui.label}>Name<input value={name} onChange={(e) => setName(e.target.value.slice(0, 31))} className="input mt-1 block w-36 font-mono" aria-invalid={safe(name) !== name} /></label>
        {files.length > 0 && <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => void download()}><Download className="h-3.5 w-3.5" aria-hidden />Download all ({files.length} files)</button>}
      </div>
      <p className="max-w-[75ch] text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{ABOUT[lang]} Continuous blocks step by forward Euler at the diagram’s time step ({dg.dt} s); charts run once a step. Inputs are the Board input blocks (their value already scaled), outputs every wired Scope input and Board output.</p>
      {error ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{error}</p> : file && (
        <div className="rounded-lg border border-zinc-200 dark:border-white/10">
          <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 p-1.5 dark:border-white/10">
            <div role="tablist" aria-label="Files" className="flex flex-wrap gap-1">
              {files.map((f, i) => <button key={f.name} type="button" role="tab" aria-selected={f === file} className={cn(ui.small, 'font-mono', f === file && 'bg-zinc-100 dark:bg-white/10')} onClick={() => setPick(i)}>{f.name}</button>)}
            </div>
            <button type="button" className={cn(ui.small, 'ms-auto')} onClick={() => { void navigator.clipboard.writeText(file.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}><Copy className="h-3.5 w-3.5" aria-hidden />{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <pre role="tabpanel" aria-label={file.name} tabIndex={0} translate="no" className="max-h-[26rem] overflow-auto p-3 font-mono text-xs leading-relaxed text-zinc-800 dark:text-zinc-100" data-code-file={file.name}>{file.text}</pre>
        </div>
      )}
    </div>
  );
}
