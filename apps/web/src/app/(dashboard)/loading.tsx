// Shown inside the portal (the sidebar stays) while a page's code loads. Neutral shapes that match
// most pages: a title bar, a row of figures and two panels, so nothing jumps when the page arrives.
export default function Loading() {
  const block = 'rounded-2xl bg-zinc-200/70 dark:bg-white/[0.05]';
  return (
    <div role="status" aria-label="Loading" className="flex flex-col flex-1 min-w-0 animate-pulse">
      <div className="h-16 px-4 sm:px-8 flex items-center justify-between border-b border-zinc-200/70 dark:border-white/[0.06]">
        <div className="space-y-2">
          <div className={`${block} h-4 w-40 rounded-lg`} />
          <div className={`${block} h-3 w-56 rounded-lg`} />
        </div>
        <div className={`${block} h-9 w-36 rounded-xl hidden sm:block`} />
      </div>
      <div className="flex-1 p-4 sm:p-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className={`${block} h-28 rounded-3xl`} />)}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className={`${block} h-72 rounded-3xl xl:col-span-8`} />
          <div className={`${block} h-72 rounded-3xl xl:col-span-4`} />
        </div>
      </div>
    </div>
  );
}
