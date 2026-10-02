import { stripeKeyProblem } from '@/lib/billing';

// Which of the Worker's settings (Cloudflare → universe-web → Settings → Variables and Secrets) the
// running site can actually see, for the owner console's Server tab. Only names and yes/no go out,
// never a value. A setting saved under a slightly different name (a space, lower case, a dash) is
// named too, since the site looks names up exactly.

const SETTINGS: { name: string; what: string; needed?: boolean }[] = [
  { name: 'STRIPE_SECRET_KEY', what: 'Online payments (sk_live_…)', needed: true },
  { name: 'STRIPE_WEBHOOK_SECRET', what: 'Payments marked as paid (whsec_…)', needed: true },
  { name: 'RESEND_API_KEY', what: 'Emails' },
  { name: 'RESEND_FROM', what: 'Email sender address' },
  { name: 'GEMINI_API_KEY', what: 'AI features' },
  { name: 'R2_ACCOUNT_ID', what: 'File storage (large chat files)' },
  { name: 'R2_BUCKET', what: 'File storage (large chat files)' },
  { name: 'R2_ACCESS_KEY_ID', what: 'File storage (large chat files)' },
  { name: 'R2_SECRET_ACCESS_KEY', what: 'File storage (large chat files)' },
  { name: 'NEXT_PUBLIC_FILES_URL', what: 'File storage address (https://files.universeimpact.com)' },
  { name: 'CREDENTIAL_SIGNING_PRIVATE_KEY', what: 'Signed credentials and badges' },
  { name: 'SESSION_SECRET', what: 'Sign-in from an LMS' },
  { name: 'VAPID_PUBLIC_KEY', what: 'Push notifications' },
  { name: 'VAPID_PRIVATE_KEY', what: 'Push notifications' },
  { name: 'VAPID_EMAIL', what: 'Push notifications contact' },
  { name: 'SUPER_ADMIN_EMAILS', what: 'Extra owner emails (universeimpact1@gmail.com works without it)' },
  { name: 'CF_USAGE_TOKEN', what: 'Spending guard' },
  { name: 'CF_ACCOUNT_ID', what: 'Spending guard' },
  { name: 'CF_ADMIN_TOKEN', what: 'Put an earlier version live from this console (Workers Scripts: Edit only)' },
];

const squash = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, '');

export interface SettingCheck { name: string; what: string; needed: boolean; set: boolean; problem: string | null }

export function serverSettings(): SettingCheck[] {
  const names = Object.keys(process.env).filter((k) => typeof process.env[k] === 'string');
  return SETTINGS.map((s) => {
    const set = !!process.env[s.name]?.trim();
    const lookalike = set ? null : names.find((k) => k !== s.name && squash(k) === squash(s.name)) ?? null;
    let problem: string | null = null;
    if (s.name === 'STRIPE_SECRET_KEY' && set) problem = stripeKeyProblem();
    if (s.name === 'STRIPE_WEBHOOK_SECRET' && set && !process.env[s.name]!.trim().startsWith('whsec_')) problem = 'should start with whsec_ (the signing secret from your Stripe webhook page).';
    if (lookalike) problem = `saved as "${lookalike}" instead. Delete that one and add it again named exactly ${s.name}.`;
    return { name: s.name, what: s.what, needed: !!s.needed, set, problem };
  });
}
