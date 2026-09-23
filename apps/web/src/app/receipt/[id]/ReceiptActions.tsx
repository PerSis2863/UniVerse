'use client';

import { useEffect } from 'react';

export default function ReceiptActions() {
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("download") === "true") {
      setTimeout(() => {
        window.print();
      }, 500);
    }
  }, []);

  return (
    <div className="mt-8 flex gap-4 print:hidden">
      <button 
        onClick={() => window.print()}
        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm transition-colors"
      >
        Download PDF
      </button>
      <button 
        onClick={() => window.close()}
        className="px-6 py-2.5 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700 shadow-sm transition-colors"
      >
        Close
      </button>
    </div>
  );
}
