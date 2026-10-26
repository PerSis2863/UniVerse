// The chat safety check's quick patterns (Stage 4 · 4.10), with no imports so the game rooms
// (cloudflare/game-room.ts) can use them too: phrases that often mean trouble. `strong` ones are
// flagged even without AI.

export type SafetyKind = 'bullying' | 'threat' | 'self_harm' | 'sexual' | 'personal_info' | 'hate';
/** The quick check: phrases that often mean trouble. `strong` ones are flagged even without AI. */
const PATTERNS: { kind: SafetyKind; strong?: boolean; re: RegExp }[] = [
  { kind: 'self_harm', strong: true, re: /\b(kill(ing)? my ?self|kms|(want|wanted|going) to die|wanna die|end (it all|my life)|suicid(e|al)|self[- ]?harm(ing)?|cut(ting)? my ?self|no reason to live|better off (dead|without me)|hurt(ing)? my ?self)\b/i },
  { kind: 'threat', strong: true, re: /\b(i('?ll| will| am going to|'?m gonna) (kill|hurt|beat|stab|shoot) (you|u|him|her|them)|bring(ing)? a (gun|knife) to school|shoot (up )?the school|bomb (the|this|our) (school|class)|you('?re| are) dead|watch your back)\b/i },
  { kind: 'bullying', re: /\b(kys|kill (yo)?urself|go die|nobody (likes|wants) you|every(one|body) hates you|no ?one cares about you|you('?re| are)( so)? (ugly|fat|worthless|pathetic|disgusting|useless|a loser|a freak)|retard(ed)?)\b/i },
  { kind: 'sexual', re: /\b(send (me )?(nudes?|pics? of you|a pic of you)|nudes?|naked|sexy|don'?t tell (your|ur) (mom|mum|dad|parents?|teacher)|(our|a) (little )?secret between us|meet (me )?alone|are (you|u) home alone)\b/i },
  { kind: 'personal_info', re: /(\b\d{10}\b|\+\d[\d\s-]{8,}\d|\b(what('?s| is) (your|ur) (home )?(address|phone number|number)|where do (you|u) live|i live at)\b)/i },
  { kind: 'hate', re: /\b(go back to (your|ur) (own )?country|(you|your) people are (animals|dirty|vermin)|subhuman)\b/i },
];

/** What the quick check found in a message, or null. */
export function quickCheck(text: string): { kinds: SafetyKind[]; strong: boolean } | null {
  const hits = PATTERNS.filter((p) => p.re.test(text));
  return hits.length ? { kinds: [...new Set(hits.map((h) => h.kind))], strong: hits.some((h) => h.strong) } : null;
}

