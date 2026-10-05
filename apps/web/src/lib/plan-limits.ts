// Limits that depend on the Cloudflare Workers plan. Workers Free allows, per request, 10 ms of
// CPU and 50 subrequests (each live push to someone's Durable Object is one). Workers Paid
// ($5/month) allows 30 s of CPU and 10,000 subrequests. Set WORKERS_PAID=true in Cloudflare after
// upgrading to raise these; nothing else needs to change. callPeers caps calls through the SFU
// (every message in a call is a Durable Object request; Free allows 100,000 a day).
const paid = () => process.env.WORKERS_PAID?.trim().toLowerCase() === 'true';

export const planLimits = () => paid()
  ? { livePushes: 500, pushes: 300, callPeers: 150, similarityMaterialChars: 200_000, similarityAnswerChars: 20_000, similarityPeers: 400 }
  : { livePushes: 40, pushes: 15, callPeers: 50, similarityMaterialChars: 30_000, similarityAnswerChars: 12_000, similarityPeers: 150 };
