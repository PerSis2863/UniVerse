'use client';

import useSWR from 'swr';
import { authedJson } from '@/lib/authed-fetch';
import { hasFeature, type PlanId, type PremiumFeature } from '@/lib/plans';

export interface SubscriptionInfo {
  organization: { id: string; name: string };
  plan: PlanId;
  subscribedPlan: PlanId;
  status: string | null;
  interval: 'month' | 'year' | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasBillingAccount: boolean;
}

export function useSubscription() {
  const { data, error, isLoading, mutate } = useSWR<SubscriptionInfo>('/api/billing/subscription', authedJson, {
    revalidateOnFocus: true,
  });
  const plan: PlanId = data?.plan ?? 'STARTER';
  return {
    subscription: data,
    plan,
    isLoading,
    error,
    refresh: mutate,
    can: (feature: PremiumFeature) => hasFeature(plan, feature),
  };
}
