// Limits that depend on the Cloudflare Workers plan. Workers Free allows, per request, 10 ms of
// CPU and 50 subrequests (each live push to someone's Durable Object is one). Workers Paid
// ($5/month) allows 30 s of CPU and 10,000 subrequests. Set WORKERS_PAID=true in Cloudflare after
// upgrading to raise these; nothing else needs to change.
const paid = () => process.env.WORKERS_PAID?.trim().toLowerCase() === 'true';

export const planLimits = () => paid()
  ? { livePushes: 500, similarityMaterialChars: 200_000, similarityAnswerChars: 20_000, similarityPeers: 400 }
  : { livePushes: 40, similarityMaterialChars: 30_000, similarityAnswerChars: 12_000, similarityPeers: 150 };
