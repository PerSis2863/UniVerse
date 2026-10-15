import { PageSkeleton } from './PageSkeleton';

/**
 * What a page served from its built copy shows until it has read its address (usePathParams): the
 * portal's page skeleton inside the app, a quiet placeholder on public pages.
 */
export function AddressLoading({ portal }: { portal?: boolean }) {
  if (portal) return <PageSkeleton />;
  return (
    <div role="status" aria-label="Loading" className="min-h-[60vh] flex flex-col items-center justify-center gap-3 p-6">
      <div className="skeleton h-8 w-56 rounded-xl" />
      <div className="skeleton h-4 w-72 max-w-full rounded-lg" />
    </div>
  );
}
