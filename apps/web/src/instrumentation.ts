import type { Instrumentation } from 'next';

// Server errors from any page or API route (not only the core API router) are recorded for the
// owner console → Errors, with the real message and stack, instead of only a bare 500.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  try {
    const { recordError } = await import('@/server/errors');
    const e = err instanceof Error ? err : new Error(String(err));
    const digest = typeof err === 'object' && err !== null && 'digest' in err ? ` (digest ${String((err as { digest: unknown }).digest)})` : '';
    await recordError({
      source: 'SERVER',
      kind: context.routeType === 'route' ? 'api' : 'render',
      message: `${request.method} failed: ${e.name}: ${e.message}${digest}`,
      stack: e.stack,
      path: request.path.split('?')[0],
    });
  } catch {
    // Never let error reporting cause another error.
  }
};
