// Who runs UniVerse, used by the legal pages, the footer and the contact page. Keep in step with
// the Terms and Privacy Policy (legal/*.md → public/legal/*.pdf).
export const COMPANY = {
  legalName: 'Universe Impact',
  brand: 'UniVerse',
  address: ['Rue de la Patouillerie', '44700 Orvault (Nantes)', 'France'],
  website: 'universeimpact.com',
  email: {
    general: 'myuniverseimpact@gmail.com',
    support: 'support@universeimpact.com',
    privacy: 'privacy@universeimpact.com',
    legal: 'legal@universeimpact.com',
    security: 'security@universeimpact.com',
  },
  // Hosting provider (required on the French "mentions légales").
  host: {
    name: 'Cloudflare, Inc.',
    address: '101 Townsend Street, San Francisco, CA 94107, United States',
    website: 'cloudflare.com',
  },
} as const;

/** The links in the site's legal bar (footer), in order. */
export const LEGAL_LINKS = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/privacy-choices', label: 'Your Privacy Choices' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/accessibility', label: 'Accessibility' },
  { href: '/legal-notice', label: 'Legal Notice' },
] as const;
