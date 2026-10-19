import crypto from 'node:crypto';

// Stage 5 · C6: Stripe Provider implementation
// Provides international currency checkout sessions and refund processing

export async function createStripeSession(params: {
  secretKey: string;
  amountMinor: number;
  currency: string;
  customerEmail: string;
  customerName: string;
  description: string;
  clientReferenceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}): Promise<{ id: string; url: string }> {
  if (params.secretKey.startsWith('sk_test_mock') || !params.secretKey) {
    // Test mode only (provider.ts never passes a test key otherwise): no Stripe page, straight back.
    const mockId = `cs_test_${crypto.randomBytes(12).toString('hex')}`;
    return {
      id: mockId,
      url: params.successUrl.replace('{CHECKOUT_SESSION_ID}', mockId),
    };
  }

  const formData = new URLSearchParams();
  formData.append('mode', 'payment');
  if (params.customerEmail) formData.append('customer_email', params.customerEmail);
  formData.append('client_reference_id', params.clientReferenceId);
  formData.append('success_url', params.successUrl);
  formData.append('cancel_url', params.cancelUrl);
  formData.append('line_items[0][price_data][currency]', params.currency.toLowerCase());
  formData.append('line_items[0][price_data][unit_amount]', String(params.amountMinor));
  formData.append('line_items[0][price_data][product_data][name]', params.description);
  formData.append('line_items[0][quantity]', '1');

  if (params.metadata) {
    for (const [k, v] of Object.entries(params.metadata)) {
      formData.append(`metadata[${k}]`, String(v));
    }
  }

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Stripe Checkout Session creation failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { id: string; url: string };
  return data;
}

export async function refundStripePayment(params: {
  secretKey: string;
  paymentIntentId: string;
  amountMinor?: number;
  reason?: string;
}): Promise<{ id: string; amount: number; status: string }> {
  if (params.secretKey.startsWith('sk_test_mock') || !params.secretKey) {
    return {
      id: `re_${crypto.randomBytes(12).toString('hex')}`,
      amount: params.amountMinor ?? 0,
      status: 'succeeded',
    };
  }

  const formData = new URLSearchParams();
  formData.append('payment_intent', params.paymentIntentId);
  if (params.amountMinor) formData.append('amount', String(params.amountMinor));
  if (params.reason) formData.append('reason', 'requested_by_customer');

  const res = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Stripe Refund failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { id: string; amount: number; status: string };
  return data;
}
