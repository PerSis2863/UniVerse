'use client';

import { Suspense, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Loader2, Printer } from 'lucide-react';
import Link from '@/components/ui/Link';
import { QrCode } from '@/components/ui/QrCode';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { downloadCsv } from '@/lib/csv-download';
import { formatCode } from '@/lib/trace';

// UniVerse Trace · print sheet: a batch's codes as labels (QR code + the code in readable groups),
// 60 to a page so the browser stays smooth, or every code as a CSV for a label printer. Each QR code
// opens that unit's passport (/t/<code>).

const PER_PAGE = 60;
interface Codes { batch: { id: string; label: string; quantity: number; product: string }; codes: { serial: number; code: string }[] }

export default function PrintPage() {
  return <Suspense><Sheet /></Suspense>;
}

function Sheet() {
  const batchId = useSearchParams().get('batch') ?? '';
  const [page, setPage] = useState(0);
  const { data, error } = useSWR<Codes>(batchId ? `/trace/batches/${batchId}/codes?from=${page * PER_PAGE}&count=${PER_PAGE}` : null, fetcher, { keepPreviousData: true });
  const [exporting, setExporting] = useState(false);
  const origin = useMemo(() => (typeof window === 'undefined' ? '' : window.location.origin), []);
  const pages = data ? Math.ceil(data.batch.quantity / PER_PAGE) : 1;

  const exportAll = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const rows: string[][] = [];
      const total = Math.min(data.batch.quantity, 50_000);
      for (let from = 0; from < total; from += 1000) {
        const res = await api.get<Codes>(`/trace/batches/${batchId}/codes?from=${from}&count=1000`);
        for (const c of res.data.codes) rows.push([String(c.serial), formatCode(c.code), `${origin}/t/${c.code}`]);
      }
      downloadCsv(`codes-${data.batch.label.replace(/[^\w-]+/g, '-')}`, ['Unit', 'Code', 'Address in the QR code'], rows);
      if (data.batch.quantity > total) toast.message(`The file has the first ${total.toLocaleString()} codes; ask us for the rest.`);
    } catch (e) { toast.error(errorMessage(e, 'Could not export the codes.')); } finally { setExporting(false); }
  };

  if (!batchId) return <p className="p-8 text-sm text-zinc-500">Open this page from a batch’s “Print codes”.</p>;
  if (error) return <p className="p-8 text-sm text-rose-600">These codes couldn’t load.</p>;
  return (
    <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto">
        <div className="print-hide flex flex-wrap items-center gap-2 mb-4">
          <Link href="/trace" className="btn-secondary btn-sm"><ArrowLeft className="w-4 h-4" />Trace</Link>
          <h1 className="me-auto text-lg font-bold text-zinc-900 dark:text-white">{data ? `${data.batch.product} · ${data.batch.label}` : 'Codes'}</h1>
          <button type="button" onClick={() => void exportAll()} disabled={!data || exporting} className="btn-secondary btn-sm">{exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}CSV for a label printer</button>
          <button type="button" onClick={() => window.print()} disabled={!data} className="btn-primary btn-sm"><Printer className="w-4 h-4" />Print this page</button>
        </div>
        {data && (
          <div className="print-hide flex items-center justify-between mb-3 text-sm text-zinc-600 dark:text-zinc-300">
            <span>Units {(page * PER_PAGE + 1).toLocaleString()}–{Math.min((page + 1) * PER_PAGE, data.batch.quantity).toLocaleString()} of {data.batch.quantity.toLocaleString()}</span>
            <span className="flex gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="btn-secondary btn-sm" aria-label="Previous page"><ChevronLeft className="w-4 h-4" /></button>
              <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} className="btn-secondary btn-sm" aria-label="Next page"><ChevronRight className="w-4 h-4" /></button>
            </span>
          </div>
        )}
        {!data ? <div className="h-96 rounded-3xl skeleton" /> : (
          <div className="print-sheet grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {data.codes.map((c) => (
              <div key={c.code} className="trace-label rounded-xl border border-[#e1e6f2] bg-white p-3 flex flex-col items-center text-center text-[#171f44]">
                <QrCode value={`${origin}/t/${c.code}`} size={112} title={`Passport of unit ${c.serial}`} />
                <p className="mt-1.5 font-mono text-[10px] leading-tight">{formatCode(c.code)}</p>
                <p className="text-[9px] text-[#58617f] truncate max-w-full">{data.batch.product} · #{c.serial}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
