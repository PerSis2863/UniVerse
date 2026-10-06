// Placeholder for a portal page that is still loading (the sidebar, bars and tab bar stay). Shaped
// like the page on each screen size, so nothing jumps when it arrives: on phones a large title,
// a tab row and stacked cards; on larger screens the title bar, a row of figures and two panels.
// Used by (dashboard)/loading.tsx and while a tapped page downloads (PendingPage).
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="skeleton-in flex flex-col flex-1 min-w-0">
      {/* Phones */}
      <div className="lg:hidden px-4 pt-3 pb-2 space-y-2">
        <div className="skeleton h-9 w-52 rounded-xl" />
        <div className="skeleton h-3.5 w-64 rounded-lg" />
        <div className="skeleton h-9 w-full rounded-[11px] mt-3" />
      </div>
      <div className="lg:hidden p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
        {[0, 1, 2].map((i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}
      </div>

      {/* Larger screens */}
      <div className="hidden lg:flex h-16 px-8 items-center justify-between">
        <div className="space-y-2">
          <div className="skeleton h-5 w-44 rounded-lg" />
          <div className="skeleton h-3 w-60 rounded-lg" />
        </div>
        <div className="skeleton h-9 w-56 rounded-[10px]" />
      </div>
      <div className="hidden lg:block flex-1 p-8 space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28 rounded-3xl" />)}
        </div>
        <div className="grid grid-cols-12 gap-6">
          <div className="skeleton h-72 rounded-3xl col-span-8" />
          <div className="skeleton h-72 rounded-3xl col-span-4" />
        </div>
      </div>
    </div>
  );
}
