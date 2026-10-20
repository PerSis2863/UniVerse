import CheckCredential from './CheckCredential';

// The employer's check (Stage 5 · Q14): enter a certificate code, or a badge or wallet file, and see
// whether UniVerse issued it. No account needed. A plain page built ahead of time.
export default function VerifyIndexPage() {
  return <CheckCredential />;
}
