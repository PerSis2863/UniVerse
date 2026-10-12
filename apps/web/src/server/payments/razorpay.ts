import crypto from 'node:crypto';

// Stage 5 · C6: Razorpay & UPI Provider implementation
// Cloudflare Workers compatible (fetch API + Web Crypto / node:crypto)

export function computeRazorpaySignature(
  orderId: string,
  paymentId: string,
  keySecret: string,
): string {
  const hmac = crypto.createHmac('sha256', keySecret);
  hmac.update(`${orderId}|${paymentId}`);
  return hmac.digest('hex');
}

export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string,
): boolean {
  if (!orderId || !paymentId || !signature || !keySecret) return false;
  try {
    const expected = computeRazorpaySignature(orderId, paymentId, keySecret);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function verifyRazorpayWebhookSignature(
  payload: string,
  signature: string,
  webhookSecret: string,
): boolean {
  if (!payload || !signature || !webhookSecret) return false;
  try {
    const hmac = crypto.createHmac('sha256', webhookSecret);
    hmac.update(payload);
    const expected = hmac.digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Constructs standard NPCI UPI Intent URI for QR code or deep-linking on UPI apps
 * (Google Pay, PhonePe, Paytm, BHIM).
 */
export function generateUpiIntentUri(params: {
  payeeVpa: string;
  payeeName: string;
  amountMinor: number;
  transactionRef: string;
  note: string;
}): string {
  const amountMajor = (params.amountMinor / 100).toFixed(2);
  const q = new URLSearchParams({
    pa: params.payeeVpa,
    pn: params.payeeName,
    am: amountMajor,
    cu: 'INR',
    tr: params.transactionRef,
    tn: params.note.slice(0, 80),
  });
  return `upi://pay?${q.toString()}`;
}

export async function createRazorpayOrder(params: {
  keyId: string;
  keySecret: string;
  amountMinor: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<{ id: string; amount: number; currency: string; receipt: string }> {
  // If test keys or development without outbound network credentials, generate deterministic mock
  if (params.keyId.startsWith('rzp_test_mock') || !params.keySecret) {
    const mockId = `order_${crypto.randomBytes(8).toString('hex')}`;
    return {
      id: mockId,
      amount: params.amountMinor,
      currency: params.currency,
      receipt: params.receipt,
    };
  }

  const authHeader = `Basic ${Buffer.from(`${params.keyId}:${params.keySecret}`).toString('base64')}`;
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify({
      amount: params.amountMinor,
      currency: params.currency.toUpperCase(),
      receipt: params.receipt,
      notes: params.notes,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Razorpay Order creation failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { id: string; amount: number; currency: string; receipt: string };
  return data;
}

export async function refundRazorpayPayment(params: {
  keyId: string;
  keySecret: string;
  paymentId: string;
  amountMinor?: number;
  notes?: Record<string, string>;
}): Promise<{ id: string; amount: number; status: string }> {
  if (params.keyId.startsWith('rzp_test_mock') || !params.keySecret) {
    return {
      id: `rfnd_${crypto.randomBytes(8).toString('hex')}`,
      amount: params.amountMinor ?? 0,
      status: 'processed',
    };
  }

  const authHeader = `Basic ${Buffer.from(`${params.keyId}:${params.keySecret}`).toString('base64')}`;
  const body: Record<string, unknown> = {};
  if (params.amountMinor) body.amount = params.amountMinor;
  if (params.notes) body.notes = params.notes;

  const res = await fetch(`https://api.razorpay.com/v1/payments/${params.paymentId}/refund`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Razorpay Refund failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { id: string; amount: number; status: string };
  return data;
}
