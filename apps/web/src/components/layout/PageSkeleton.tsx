// Placeholder for a portal page that is still loading (the sidebar stays). Neutral shapes that
// match most pages: a title bar, a row of figures and two panels, so nothing jumps when the page
// arrives. Used by (dashboard)/loading.tsx and while a tapped page downloads (PendingPage).
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="skeleton-in flex flex-col flex-1 min-w-0">
      <div className="h-16 px-4 sm:px-8 flex items-center justify-between border-b border-zinc-200/70 dark:border-white/[0.06]">
        <div className="space-y-2">
          <div className="skeleton h-4 w-40 rounded-lg" />
          <div className="skeleton h-3 w-56 rounded-lg" />
        </div>
        <div className="skeleton h-9 w-36 rounded-xl hidden sm:block" />
      </div>
      <div className="flex-1 p-4 sm:p-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28 rounded-3xl" />)}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="skeleton h-72 rounded-3xl xl:col-span-8" />
          <div className="skeleton h-72 rounded-3xl xl:col-span-4" />
        </div>
      </div>
    </div>
  );
}
