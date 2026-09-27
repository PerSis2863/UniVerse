// Single source of truth for subscription plans and which premium features each one unlocks.
// Used by the pricing page, the billing page, <PremiumGate>, and the server-side checks in
// /api/billing and /api/premium — so a feature can't be advertised on one plan and gated on another.

export type PlanId = 'STARTER' | 'PRO' | 'ENTERPRISE';
export type BillingInterval = 'month' | 'year';

export type PremiumFeature = 'advanced_analytics' | 'data_exports' | 'ai_impact_reports';

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Price in USD cents per month, for each billing interval (yearly is billed as 12x this). */
  monthlyPrice: Record<BillingInterval, number>;
  highlight?: boolean;
  features: string[];
  unlocks: PremiumFeature[];
}

export const PLANS: Record<PlanId, Plan> = {
  STARTER: {
    id: 'STARTER',
    name: 'Starter',
    tagline: 'Everything a campus needs to get going.',
    monthlyPrice: { month: 0, year: 0 },
    features: [
      'Student, teacher & admin portals',
      'Courses, grades, attendance & timetable',
      'NGO project marketplace',
      'Real-time messaging & groups',
      'Verified credentials (Polygon)',
      'Installable app for iOS, Android & desktop',
    ],
    unlocks: [],
  },
  PRO: {
    id: 'PRO',
    name: 'Pro',
    tagline: 'Insight and reporting for growing institutions.',
    monthlyPrice: { month: 14900, year: 11900 },
    highlight: true,
    features: [
      'Everything in Starter',
      'Advanced analytics dashboard',
      'One-click CSV data exports',
      'Priority email support',
    ],
    unlocks: ['advanced_analytics', 'data_exports'],
  },
  ENTERPRISE: {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    tagline: 'AI-powered reporting for networks and NGOs.',
    monthlyPrice: { month: 44900, year: 35900 },
    features: [
      'Everything in Pro',
      'AI executive impact reports',
      'Dedicated onboarding session',
      'Invoiced billing on request',
    ],
    unlocks: ['advanced_analytics', 'data_exports', 'ai_impact_reports'],
  },
};

export const PLAN_ORDER: PlanId[] = ['STARTER', 'PRO', 'ENTERPRISE'];

export const FEATURE_INFO: Record<PremiumFeature, { name: string; description: string; minPlan: PlanId }> = {
  advanced_analytics: {
    name: 'Advanced Analytics',
    description: 'Live growth, engagement and impact trends across your whole organization.',
    minPlan: 'PRO',
  },
  data_exports: {
    name: 'Data Exports',
    description: 'Download members, impact points and project applications as CSV.',
    minPlan: 'PRO',
  },
  ai_impact_reports: {
    name: 'AI Impact Reports',
    description: 'A board-ready executive summary of your impact, written by AI from your live data.',
    minPlan: 'ENTERPRISE',
  },
};

// A subscription only grants features while Stripe considers it paid up.
const ENTITLED_STATUSES = new Set(['active', 'trialing']);

export function effectivePlan(org: { plan: PlanId; subscriptionStatus: string | null } | null): PlanId {
  if (!org || org.plan === 'STARTER') return 'STARTER';
  return org.subscriptionStatus && ENTITLED_STATUSES.has(org.subscriptionStatus) ? org.plan : 'STARTER';
}

export function hasFeature(plan: PlanId, feature: PremiumFeature): boolean {
  return PLANS[plan].unlocks.includes(feature);
}

export function isPaidPlan(id: string): id is Exclude<PlanId, 'STARTER'> {
  return id === 'PRO' || id === 'ENTERPRISE';
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
