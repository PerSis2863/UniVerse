// Honest AI receipts (Stage 5 · D12): each assignment says whether AI may be used, and a student can
// attach a receipt of the AI help they used in UniVerse (recorded as they used it, kept private until
// they attach it). Integrity by transparency, not detectors. Shared by the server, pages and tests.

export const AI_POLICIES = {
  FREE: { label: 'Free to use', short: 'AI free to use', hint: 'Students may use AI however they like; a receipt is optional.' },
  RECEIPT: { label: 'Allowed with a receipt', short: 'AI allowed with a receipt', hint: 'Students may use AI, and attach a receipt of the AI help they used.' },
  NONE: { label: 'Not allowed', short: 'No AI', hint: 'Students say they didn’t use AI, or attach a receipt and explain.' },
} as const;
export type AiPolicy = keyof typeof AI_POLICIES;
export const isAiPolicy = (x: unknown): x is AiPolicy => typeof x === 'string' && Object.hasOwn(AI_POLICIES, x);

/** The kinds of AI help that are recorded (reading help such as translation and simpler words is not). */
export const AI_USE_KINDS = {
  assistant: 'AI assistant',
  tutor: 'Course AI tutor',
  homework: 'Homework photo help',
  voice: 'Voice tutor',
  writing: 'Writing helper (Docs)',
  whiteboard: 'Whiteboard AI',
  summary: 'File summary',
  chat: 'AI in chat (/ask)',
  study: 'Practice questions and flashcards',
  oral: 'Oral practice',
  discussion: 'Discussion answer drafts',
  syllabus: 'Syllabus drafts',
  rubric: 'Rubric explanations',
  marking: 'Help marking short answers',
  interview: 'Interview practice',
  ta: 'Class TA (during a class)',
} as const;
export type AiUseKind = keyof typeof AI_USE_KINDS;
export const aiUseLabel = (k: string) => (k in AI_USE_KINDS ? AI_USE_KINDS[k as AiUseKind] : 'AI help');

export interface AiUseItem { kind: string; detail: string; at: string; courseId: string | null }
export interface AiReceipt {
  policy: AiPolicy;
  /** The student attached the record of their AI help. */
  attached: boolean;
  /** The student declared they didn't use AI. */
  declaredNone: boolean;
  /** In their own words: anything else (e.g. AI used outside UniVerse). */
  note: string;
  uses: AiUseItem[];
  /** The record starts here (when the assignment was set). */
  since: string;
  at: string;
  /** Sent from a device that was offline: no receipt was made. */
  offline?: boolean;
  /** Handed in by itself when a quiz's time ran out, before the student chose (Stage 5 · Q22). */
  auto?: boolean;
  /** The record covers the attempt itself (a quiz or oral check, from `since` to `at`), not "since it was set". */
  during?: boolean;
}

/** A short, single-line excerpt of what someone asked, for the record. */
export const excerpt = (text: string, n = 140) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** What the student chose when handing in, checked against the assignment's rule; an error to show, or null. */
export function receiptProblem(policy: AiPolicy, input: { attach?: unknown; declaredNone?: unknown }): string | null {
  const attach = input.attach === true, none = input.declaredNone === true;
  if (attach && none) return 'Choose one: you didn’t use AI, or you’re attaching your AI receipt.';
  if (policy === 'RECEIPT' && !attach) return 'This assignment asks for your AI receipt. Attach it to hand in (it can be empty).';
  if (policy === 'NONE' && !attach && !none) return 'This assignment doesn’t allow AI. Say you didn’t use it, or attach your AI receipt and explain.';
  return null;
}

/** "Course AI tutor ×3 · Writing helper (Docs) ×1", most used first. */
export function usesSummary(uses: { kind: string }[]): string {
  const counts = new Map<string, number>();
  for (const u of uses) counts.set(u.kind, (counts.get(u.kind) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${aiUseLabel(k)} ×${n}`).join(' · ');
}

/** A receipt as stored (JSON), or null when it's missing or broken. */
export function parseReceipt(json: string | null | undefined): AiReceipt | null {
  if (!json) return null;
  try {
    const r = JSON.parse(json) as Partial<AiReceipt>;
    if (!isAiPolicy(r.policy)) return null;
    return {
      policy: r.policy, attached: r.attached === true, declaredNone: r.declaredNone === true, note: typeof r.note === 'string' ? r.note : '',
      uses: Array.isArray(r.uses) ? r.uses.filter((u) => u && typeof u.kind === 'string' && typeof u.at === 'string').map((u) => ({ kind: u.kind, detail: String(u.detail ?? ''), at: u.at, courseId: u.courseId ?? null })) : [],
      since: typeof r.since === 'string' ? r.since : '', at: typeof r.at === 'string' ? r.at : '', ...(r.offline ? { offline: true } : {}), ...(r.auto ? { auto: true } : {}), ...(r.during ? { during: true } : {}),
    };
  } catch { return null; }
}

/** A class's receipts at a glance for the teacher (Stage 5 · Q22): how many attached one, said no AI, or gave nothing. */
export function receiptSummary(receipts: (AiReceipt | null)[]) {
  const attached = receipts.filter((r) => r?.attached);
  const uses = attached.flatMap((r) => r!.uses);
  return {
    total: receipts.length,
    attached: attached.length,
    withUses: attached.filter((r) => r!.uses.length > 0).length,
    declaredNone: receipts.filter((r) => r?.declaredNone).length,
    notes: receipts.filter((r) => r?.note).length,
    nothing: receipts.filter((r) => !r || (!r.attached && !r.declaredNone)).length,
    uses: uses.length,
    byKind: usesSummary(uses),
  };
}
