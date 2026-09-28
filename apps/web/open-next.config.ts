// Build settings for deploying the web app to Cloudflare Workers with @opennextjs/cloudflare.
import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache';

// The app doesn't use ISR/revalidation, so pages prerendered at build time are served straight
// from the static assets and no cache bucket is needed.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
