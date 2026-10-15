// What students hand in for an assignment (Stage 5 · B3.2): a written answer, a file uploaded here,
// or a link; files and links can carry a short note.

export const SUBMIT_KINDS = ['TEXT', 'FILE', 'LINK'] as const;
export type SubmitKind = (typeof SUBMIT_KINDS)[number];
export const isSubmitKind = (v: unknown): v is SubmitKind => (SUBMIT_KINDS as readonly unknown[]).includes(v);

export const SUBMIT_LABEL: Record<SubmitKind, { label: string; hint: string }> = {
  TEXT: { label: 'A written answer', hint: 'Typed here. The AI can draft its grade for you to check.' },
  FILE: { label: 'A file', hint: 'A PDF, document, picture or video, up to 25 MB, with an optional note.' },
  LINK: { label: 'A link', hint: 'A web address (a site, a video, a shared document), with an optional note.' },
};
