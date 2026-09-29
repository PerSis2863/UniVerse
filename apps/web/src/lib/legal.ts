// UniVerse's Terms and Conditions and Privacy Policy, published as PDFs in public/legal.
// To update one, replace the PDF (same file name) and change `updated`. If people must agree to
// the new version, also bump TERMS_VERSION in src/lib/terms-version.ts.
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
