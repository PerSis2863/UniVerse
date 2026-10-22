// Runs first in every site build on Cloudflare (package.json "build"): builds only main, and asks the live site whether
// this billing month's build minutes allow another build (cloudflare/usage-guard.ts buildBudget).
// Past 90% of the 6,000 minutes the $5 plan includes, the build stops here, in its first seconds,
// so nothing extra is charged; the change goes live after the next billing month starts, or when the
// owner adds the CF_GUARD_OFF secret. Anywhere else (your computer, tests) it does nothing, and if
// the site can't be reached the build goes on (a build is never blocked by a network hiccup).
if (process.env.WORKERS_CI) {
  // Only main goes live, so only main is built: a work branch's build would spend 15-20 of the
  // month's minutes on a version nobody opens. (Set the build variable BUILD_ALL_BRANCHES=1 to
  // build every branch again.)
  const branch = process.env.WORKERS_CI_BRANCH;
  if (branch && branch !== 'main' && !process.env.BUILD_ALL_BRANCHES) {
    console.error(`\n✖ Not building branch "${branch}": only main is built, to keep the Cloudflare bill at $5.\n`);
    process.exit(1);
  }
  const site = (process.env.NEXT_PUBLIC_APP_URL || 'https://universeimpact.com').replace(/\/+$/, '');
  try {
    const res = await fetch(`${site}/api/build-budget`, { signal: AbortSignal.timeout(8000) });
    const answer = res.ok ? await res.json() : null;
    if (answer?.stop) {
      console.error(`\n✖ Build stopped to keep the Cloudflare bill at $5: ${answer.reason}`);
      console.error('  It will build again when the next billing month starts. To build now and pay for the extra minutes ($0.005 each), add the secret CF_GUARD_OFF to universe-web.\n');
      process.exit(1);
    }
    console.log(`Build budget: ${answer?.used ?? '?'} of ${answer?.limit ?? 6000} minutes used this billing month.`);
  } catch (e) {
    console.log(`Build budget: couldn't ask the site (${e.message}); building anyway.`);
  }
}
