import { redirect } from 'next/navigation';

// Certificates and proof of work live on the Verified Credentials page, backed by real,
// signed and blockchain-anchored records.
export default function Page() {
  redirect('/student/credentials');
}
