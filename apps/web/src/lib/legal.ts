// UniVerse's Terms and Conditions and Privacy Policy, shown on /terms and /privacy from their Markdown
// (also published as PDFs in public/legal).
// Their editable text is in legal/terms.md and legal/privacy.md. To update one, edit the Markdown,
// update "Last Updated" inside, and remake the PDFs (`node scripts/legal-pdf.mjs`, M337). If people must agree
// to the new version, also bump TERMS_VERSION in src/lib/terms-version.ts. The Privacy Policy's
// retention periods are enforced by the daily job (src/app/api/cron/daily/route.ts).
export const LEGAL_DOCS = {
  terms: {
    title: 'Terms and Conditions',
    href: '/terms',
    pdf: '/legal/UniVerse-Terms-and-Conditions.pdf',
    blurb: 'The agreement that governs your use of UniVerse.',
  },
  privacy: {
    title: 'Privacy Policy',
    href: '/privacy',
    pdf: '/legal/UniVerse-Privacy-Policy.pdf',
    blurb: 'How UniVerse collects, uses and protects your information.',
  },
} as const;

export type LegalDocId = keyof typeof LEGAL_DOCS;
