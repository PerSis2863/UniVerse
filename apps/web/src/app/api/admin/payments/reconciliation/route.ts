import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/billing';
import { getReconciliationReport } from '@/server/payments/provider';

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const fromStr = searchParams.get('from');
  const toStr = searchParams.get('to');
  const format = searchParams.get('format') || 'json';

  const fromDate = fromStr ? new Date(fromStr) : undefined;
  const toDate = toStr ? new Date(toStr) : undefined;

  const report = await getReconciliationReport(auth.org.id, fromDate, toDate);

  if (format === 'csv') {
    const headers = 'Transaction ID,Order Ref,Payment Ref,Amount,Currency,Provider,Purpose,Status,Customer Name,Customer Email,Paid At,Created At\n';
    const rows = report.transactions
      .map((t) => {
        const amt = (t.amount / 100).toFixed(2);
        const name = `"${(t.customerName || '').replace(/"/g, '""')}"`;
        const email = `"${(t.customerEmail || '').replace(/"/g, '""')}"`;
        return `${t.id},${t.orderRef},${t.paymentRef || ''},${amt},${t.currency},${t.provider},${t.purpose},${t.status},${name},${email},${t.paidAt || ''},${t.createdAt}`;
      })
      .join('\n');

    return new Response(headers + rows, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="reconciliation_${auth.org.slug || 'report'}_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
}
