'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Token, TokenKind } from '@/lib/highlight';

// Messages in chat's limited Markdown (Stage 4 · 1.1), always drawn as React elements, never as
// HTML, so nothing in a message can run or restyle the page:
//   **bold** or *bold*, _italic_ or __italic__, ~strike~ or ~~strike~~, `code`
//   ```lang … ``` code blocks (coloured by src/lib/highlight.ts, loaded only when needed)
//   > quotes, - or * lists, 1. lists, links, @mentions and @here / @channel / @everyone, and a
//   community's own :emoji: as pictures
// A message of just one to three emoji is drawn large, like on phones.

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'quote'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; start: number; items: string[] };

const FENCE = /^\s*```([\w+#.-]*)\s*$/;
const FENCE_END = /^\s*```\s*$/;
const QUOTE = /^\s*>\s?/;
const BULLET = /^\s*[-*•]\s+(?=\S)/;
const NUMBER = /^\s*(\d{1,3})[.)]\s+(?=\S)/;

/** The message as blocks: paragraphs, code, quotes and lists. */
export function parseBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push({ kind: 'p', text: para.join('\n') }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    const single = /^\s*```(.+?)```\s*$/.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      for (i++; i < lines.length && !FENCE_END.test(lines[i]); i++) body.push(lines[i]);
      blocks.push({ kind: 'code', lang: fence[1], code: body.join('\n') });
    } else if (single) {
      flush();
      blocks.push({ kind: 'code', lang: '', code: single[1] });
    } else if (QUOTE.test(line)) {
      flush();
      const q: string[] = [];
      for (; i < lines.length && QUOTE.test(lines[i]); i++) q.push(lines[i].replace(QUOTE, ''));
      i--;
      blocks.push({ kind: 'quote', text: q.join('\n') });
    } else if (BULLET.test(line)) {
      flush();
      const items: string[] = [];
      for (; i < lines.length && BULLET.test(lines[i]); i++) items.push(lines[i].replace(BULLET, ''));
      i--;
      blocks.push({ kind: 'ul', items });
    } else if (NUMBER.test(line)) {
      flush();
      const start = Number(NUMBER.exec(line)![1]);
      const items: string[] = [];
      for (; i < lines.length && NUMBER.test(lines[i]); i++) items.push(lines[i].replace(NUMBER, ''));
      i--;
      blocks.push({ kind: 'ol', start, items });
    } else {
      para.push(line);
    }
  }
  flush();
  return blocks;
}

// Links (without trailing punctuation), @here-style and @Name mentions, then formatting.
const INLINE = /(https?:\/\/[^\s<]*[^\s<.,:;"')\]!?])|(@(?:here|channel|everyone)\b)|(@[A-Za-z][\w.-]*(?:\s[A-Z][\w.-]*)?)|(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(\*[^*\n]+?\*)|(__[^_\n]+?__)|(_[^_\n]+?_)|(~~[^~\n]+?~~)|(~[^~\n]+?~)|(:[a-z0-9_]{2,32}:)/g;
const WORD = /[\p{L}\p{N}]/u;

/** One line or paragraph of text: links, mentions and formatting (formatting can be nested). */
function Inline({ text, mine, depth = 0, emoji }: { text: string; mine: boolean; depth?: number; emoji?: Record<string, string> }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  const re = new RegExp(INLINE.source, 'g');
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const [t] = m;
    const i = m.index;
    // Formatting marks count at word edges only: snake_case_names and 2*3*4 stay as they are.
    const mark = m[5] || m[6] || m[7] || m[8] || m[9] || m[10];
    if (mark && ((i > 0 && WORD.test(text[i - 1])) || (i + t.length < text.length && WORD.test(text[i + t.length])))) {
      re.lastIndex = i + 1;
      continue;
    }
    // :name: is a picture only when it's one of the community's emoji (else it stays text).
    if (m[11] && !emoji?.[t.slice(1, -1)]) {
      re.lastIndex = i + 1;
      continue;
    }
    if (i > last) out.push(text.slice(last, i));
    const key = `${depth}-${i}`;
    const inner = (s: string) => (depth < 3 ? <Inline text={s} mine={mine} depth={depth + 1} emoji={emoji} /> : s);
    if (m[1]) out.push(<a key={key} href={t} target="_blank" rel="noopener noreferrer nofollow" className={cn('underline underline-offset-2 break-all', mine ? 'text-white' : 'text-indigo-500 dark:text-indigo-300')}>{t}</a>);
    else if (m[2]) out.push(<span key={key} className={cn('font-semibold rounded px-1', mine ? 'bg-amber-300/30 text-amber-100' : 'bg-amber-400/20 text-amber-700 dark:text-amber-300')}>{t}</span>);
    else if (m[3]) out.push(<span key={key} className={cn('font-semibold', mine ? 'text-sky-200' : 'text-indigo-500 dark:text-indigo-300')}>{t}</span>);
    else if (m[4]) out.push(<code key={key} className={cn('px-1 py-0.5 rounded font-mono text-[0.85em]', mine ? 'bg-white/15' : 'bg-zinc-200/70 dark:bg-white/10')}>{t.slice(1, -1)}</code>);
    else if (m[5]) out.push(<strong key={key}>{inner(t.slice(2, -2))}</strong>);
    else if (m[6]) out.push(<strong key={key}>{inner(t.slice(1, -1))}</strong>);
    else if (m[7]) out.push(<em key={key}>{inner(t.slice(2, -2))}</em>);
    else if (m[8]) out.push(<em key={key}>{inner(t.slice(1, -1))}</em>);
    else if (m[9]) out.push(<s key={key}>{inner(t.slice(2, -2))}</s>);
    else if (m[10]) out.push(<s key={key}>{inner(t.slice(1, -1))}</s>);
    else if (m[11]) out.push(<img key={key} src={emoji![t.slice(1, -1)]} alt={t} title={t} className="inline-block w-[1.35em] h-[1.35em] object-contain align-[-0.3em]" draggable={false} />);
    last = i + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/** A code block: monospace on a dark card, coloured once the highlighter has loaded, with Copy. */
function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [view, setView] = useState<{ lines: Token[][]; colors: Record<TokenKind, string> } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let off = false;
    void import('@/lib/highlight').then((h) => { if (!off) setView({ lines: h.highlight(code, lang), colors: h.TOKEN_COLOR }); });
    return () => { off = true; };
  }, [code, lang]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ }
  };
  return (
    <div className="my-1.5 rounded-xl overflow-hidden bg-[#0f1220] text-[#e4e6f1] ring-1 ring-white/10 max-w-full text-left">
      <div className="flex items-center justify-between gap-3 pl-3 pr-1.5 py-1 bg-white/[0.05] text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        <span>{lang || 'code'}</span>
        <button type="button" onClick={() => void copy()} aria-label="Copy code" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-white/10 normal-case tracking-normal text-[11px]">
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}{copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="px-3 py-2 overflow-x-auto text-[12.5px] leading-[1.55] font-mono"><code>
        {view
          ? view.lines.map((line, i) => (
              <span key={i} className="block min-h-[1.55em]">
                {line.map((tok, j) => <span key={j} style={tok.kind ? { color: view.colors[tok.kind], fontStyle: tok.kind === 'com' ? 'italic' : undefined } : undefined}>{tok.text}</span>)}
              </span>
            ))
          : code}
      </code></pre>
    </div>
  );
}

const ONLY_EMOJI = /^(?:\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic})*\s*){1,3}$/u;

/** A message's text, formatted. */
export function RichText({ text, mine, emoji }: { text: string; mine: boolean; emoji?: Record<string, string> }) {
  if (ONLY_EMOJI.test(text.trim())) return <span className="block text-[2.4rem] leading-tight">{text.trim()}</span>;
  // Only a community's own emoji: large, too.
  if (emoji && /^(?:\s*:[a-z0-9_]{2,32}:){1,3}\s*$/.test(text) && text.match(/:[a-z0-9_]{2,32}:/g)!.every((t) => emoji[t.slice(1, -1)])) {
    return <span className="flex gap-1">{text.match(/:[a-z0-9_]{2,32}:/g)!.map((t, i) => <img key={i} src={emoji[t.slice(1, -1)]} alt={t} title={t} className="w-12 h-12 object-contain" draggable={false} />)}</span>;
  }
  const blocks = parseBlocks(text);
  return (
    <div className="break-words [overflow-wrap:anywhere] space-y-1">
      {blocks.map((b, i) => {
        if (b.kind === 'code') return <CodeBlock key={i} code={b.code} lang={b.lang} />;
        if (b.kind === 'quote') return <blockquote key={i} className={cn('border-l-[3px] pl-2.5 whitespace-pre-wrap', mine ? 'border-white/60 text-white/90' : 'border-indigo-400/70 text-zinc-700 dark:text-zinc-300')}><Inline text={b.text} mine={mine} emoji={emoji} /></blockquote>;
        if (b.kind === 'ul') return <ul key={i} className="list-disc pl-5 space-y-0.5">{b.items.map((it, j) => <li key={j}><Inline text={it} mine={mine} emoji={emoji} /></li>)}</ul>;
        if (b.kind === 'ol') return <ol key={i} start={b.start} className="list-decimal pl-6 space-y-0.5">{b.items.map((it, j) => <li key={j}><Inline text={it} mine={mine} emoji={emoji} /></li>)}</ol>;
        return <p key={i} className="whitespace-pre-wrap"><Inline text={b.text} mine={mine} emoji={emoji} /></p>;
      })}
    </div>
  );
}
