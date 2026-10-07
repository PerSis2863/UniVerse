// Build settings for deploying the web app to Cloudflare Workers with @opennextjs/cloudflare.
import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache';

// The app doesn't use ISR/revalidation, so pages prerendered at build time are served straight
// from the static assets and no cache bucket is needed.
//
// That cache is read-only. Next still offers it every page it renders on demand (and revalidatePath
// asks it to forget one), and the stock version logs each of those as an error
// ("StaticAssetsIncrementalCache: Failed to set to read-only cache key=/route-cache/APP_PAGE…"),
// filling Workers Logs with errors that aren't problems: the page was served fine. Reading stays
// exactly the same; writes and deletes are skipped quietly, since there's nowhere to keep them.
const readOnlyCache: typeof staticAssetsIncrementalCache = Object.assign(Object.create(staticAssetsIncrementalCache), {
  name: staticAssetsIncrementalCache.name,
  get: staticAssetsIncrementalCache.get.bind(staticAssetsIncrementalCache),
  set: async () => {},
  delete: async () => {},
});

export default defineCloudflareConfig({
  incrementalCache: readOnlyCache,
  enableCacheInterception: true,
});
