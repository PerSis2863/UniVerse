import { getTransactionById } from '@/app/actions/transaction';
import { notFound } from 'next/navigation';
import ReceiptActions from './ReceiptActions';
import Link from 'next/link';

export default async function ReceiptPage({ params }: { params: { id: string } }) {
  const transaction = await getTransactionById(params.id);

  if (!transaction || transaction.status !== 'COMPLETED') {
    return notFound();
  }

  // Format the currency dynamically
  const getCurrencySymbol = (currency: string | null) => {
    switch (currency) {
      case 'USD': case 'CAD': case 'AUD': return '$';
      case 'EUR': return '€';
      case 'GBP': return '£';
      case 'INR': return '₹';
      default: return '$';
    }
  };

  const currencySymbol = getCurrencySymbol(transaction.currency);
  const currencyCode = transaction.currency || 'USD';

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      
      {/* Return to Dashboard link (hidden when printing) */}
      <div className="w-full max-w-3xl mb-6 print:hidden">
        <Link href="/student/administrative/accounting" className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
          &larr; Back to Accounting
        </Link>
      </div>

      <div className="max-w-3xl w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-xl overflow-hidden print:shadow-none print:w-full print:max-w-full">
        {/* Header */}
        <div className="bg-indigo-600 px-8 py-10 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Universe Impact</h1>
            <p className="mt-2 text-indigo-200">myuniverseimpact@gmail.com</p>
          </div>
          <div className="mt-4 sm:mt-0 text-left sm:text-right">
            <div className="text-sm font-medium text-indigo-200 uppercase tracking-wider mb-1">Receipt</div>
            <div className="text-lg font-bold">#{transaction.id.slice(-8).toUpperCase()}</div>
          </div>
        </div>

        {/* Body */}
        <div className="px-8 py-10 print:py-6">
          <div className="flex flex-col sm:flex-row justify-between mb-10 border-b border-zinc-200 dark:border-zinc-800 pb-10">
            <div>
              <div className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Billed To</div>
              <div className="text-lg font-bold text-zinc-900 dark:text-white">{transaction.user?.name || 'Student'}</div>
              <div className="text-zinc-600 dark:text-zinc-400">{transaction.user?.email}</div>
            </div>
            <div className="mt-6 sm:mt-0 text-left sm:text-right">
              <div className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Date</div>
              <div className="text-lg font-bold text-zinc-900 dark:text-white">
                {transaction.createdAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </div>

          <table className="w-full text-left mb-10">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="pb-3 text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Description</th>
                <th className="pb-3 text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-4 text-zinc-900 dark:text-white font-medium">{transaction.description || 'Payment'}</td>
                <td className="py-4 text-zinc-900 dark:text-white font-bold text-right">
                  {currencySymbol}{transaction.amount.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="flex justify-end">
            <div className="w-full sm:w-1/2">
              <div className="flex justify-between py-3 border-t border-zinc-200 dark:border-zinc-800 text-lg font-bold text-zinc-900 dark:text-white">
                <span>Total Paid</span>
                <span>
                  {currencySymbol}{transaction.amount.toFixed(2)} {currencyCode}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-zinc-50 dark:bg-zinc-950/50 px-8 py-6 print:py-4">
          <p className="text-sm text-center text-zinc-500 dark:text-zinc-400">
            Thank you for supporting Universe Impact! If you have any questions, please contact us at myuniverseimpact@gmail.com.
          </p>
        </div>
      </div>

      <ReceiptActions />
    </div>
  );
}
