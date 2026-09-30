// UniVerse's Terms and Conditions and Privacy Policy, shown on /terms and /privacy from their Markdown
// (also published as PDFs in public/legal).
// Their editable text is in legal/terms.md and legal/privacy.md. To update one, edit the Markdown,
// export it to PDF under the same file name, and update "Last Updated" inside. If people must agree
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
