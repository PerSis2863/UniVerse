'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, ADMIN_FINANCE_TABS } from '@/components/layout/SectionTabs';
import { PaymentReconciliationPanel } from '@/components/admin/PaymentReconciliationPanel';

export default function AdminReconciliationPage() {
  return (
    <>
      <Topbar
        title="Payment Reconciliation & Gateways"
        subtitle="Manage Razorpay UPI and Stripe merchant accounts, audit online fee settlements, and process refunds"
      />
      <SectionTabs tabs={ADMIN_FINANCE_TABS} />
      <div className="p-4 md:p-8 max-w-6xl mx-auto w-full">
        <PaymentReconciliationPanel />
      </div>
    </>
  );
}
