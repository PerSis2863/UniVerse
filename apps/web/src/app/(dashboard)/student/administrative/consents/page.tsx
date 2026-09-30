import { redirect } from 'next/navigation';

// My consents now lives in Settings.
export default function StudentConsents() {
  redirect('/student/settings?section=consents');
}
