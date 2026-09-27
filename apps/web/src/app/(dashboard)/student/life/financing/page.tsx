import { redirect } from 'next/navigation';

// Payments, receipts and aid live on the Accounting page (real data).
export default function FinancingPage() {
  redirect('/student/administrative/accounting');
}
