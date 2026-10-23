// Limits that depend on the Cloudflare Workers plan. Workers Free allows, per request, 10 ms of
// CPU and 50 subrequests (each live push to someone's Durable Object is one). Workers Paid
// ($5/month) allows 30 s of CPU and 10,000 subrequests. The account is on Workers Paid since
// 22 Oct 2026: wrangler.jsonc sets CF_PLAN=paid (the older WORKERS_PAID=true secret works too).
// callPeers caps calls through the SFU (every message in a call is a Durable Object request).

/** Whether the account is on Workers Paid, from the Worker's settings (`env`, or process.env in the app). */
export function workersPaid(env: Record<string, unknown> = process.env): boolean {
  return String(env.WORKERS_PAID ?? '').trim().toLowerCase() === 'true' || String(env.CF_PLAN ?? '').trim().toLowerCase() === 'paid';
}
const paid = () => workersPaid();

export const planLimits = () => paid()
  ? { livePushes: 500, pushes: 300, callPeers: 150, similarityMaterialChars: 200_000, similarityAnswerChars: 20_000, similarityPeers: 400 }
  : { livePushes: 40, pushes: 15, callPeers: 50, similarityMaterialChars: 30_000, similarityAnswerChars: 12_000, similarityPeers: 150 };
