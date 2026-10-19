// Stage 5 · C6: Unified Payments Provider Types
// Provider abstraction covering Razorpay (India / UPI) and Stripe (International)

export type PaymentProviderName = 'RAZORPAY' | 'STRIPE';

export type PaymentPurpose = 'FEE' | 'EVENT' | 'DONATION' | 'COURSE' | 'OTHER';

export interface CreatePaymentOrderInput {
  orgId: string;
  userId: string;
  amount: number; // minor units (paise / cents)
  currency: string;
  purpose: PaymentPurpose;
  targetId?: string; // e.g. invoiceId
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  description: string;
  receiptNumber?: string;
  metadata?: Record<string, unknown>;
  /** Where the gateway sends the payer back to (default /student/fees), with ?paid=<order id>. */
  returnPath?: string;
  /** The site's address the payer is using (the request's origin), so they come back to the same one. */
  origin?: string;
  /** Use this gateway instead of the school's choice (donations: Stripe for cards). */
  provider?: PaymentProviderName;
  /** Close the gateway's page after this long (Stripe: 30 minutes to 24 hours), e.g. while a seat is held. */
  expiresInMinutes?: number;
}

export interface PaymentOrderOutput {
  orderId: string; // internal payment_orders.id
  provider: PaymentProviderName;
  orderRef: string; // gateway order / session ID
  amount: number;
  currency: string;
  keyId: string; // client publishable key or key_id
  upiIntent?: string; // UPI deep-link string for INR payments
  checkoutUrl?: string; // Hosted checkout redirect URL
  testMode?: boolean; // local test mode: no real gateway (see paymentsTestMode)
}

export interface VerifyPaymentInput {
  orderId: string; // internal ID
  provider: PaymentProviderName;
  orderRef: string;
  paymentRef: string;
  signature: string;
}

export interface VerifyPaymentOutput {
  success: boolean;
  orderId: string;
  paymentRef: string;
  amount: number;
  currency: string;
  invoiceId?: string | null;
  receiptNumber?: number;
}

export interface RefundPaymentInput {
  orderId: string;
  amount?: number; // minor units (optional for partial refund)
  reason?: string;
  actorId: string;
}

export interface RefundPaymentOutput {
  success: boolean;
  orderId: string;
  refundId: string;
  amount: number;
  status: string;
}

export interface ReconciliationReport {
  orgId: string;
  period: { from: string; to: string };
  summary: {
    totalCollectedMinor: number;
    totalTransactions: number;
    totalRefundedMinor: number;
    netCollectedMinor: number;
    currencyBreakdown: Record<string, number>;
    providerBreakdown: Record<string, { count: number; totalMinor: number }>;
    methodBreakdown: Record<string, { count: number; totalMinor: number }>;
  };
  transactions: Array<{
    id: string;
    orderRef: string;
    paymentRef: string | null;
    amount: number;
    currency: string;
    provider: string;
    purpose: string;
    status: string;
    customerName: string | null;
    customerEmail: string | null;
    paidAt: string | null;
    createdAt: string;
  }>;
}
