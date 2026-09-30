/** Shown while the session is being restored, so the dashboard never flashes a blank screen. */
export function AppSkeleton() {
  return (
    <div className="flex min-h-[100dvh]" aria-busy="true" aria-label="Loading">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col gap-3 border-r border-zinc-200 dark:border-white/[0.06] bg-white/70 dark:bg-[#0a0d13]/70 p-4">
        <p className="h-10 flex items-center gap-2 mb-4 px-1 font-black text-lg text-zinc-900 dark:text-white"><span className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-sm flex items-center justify-center">U</span>UniVerse</p>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-9 rounded-xl" />
        ))}
      </aside>
      <div className="flex-1 lg:ml-64 p-4 md:p-8 space-y-6">
        <div className="h-14 rounded-2xl bg-zinc-200/60 dark:bg-white/[0.04] flex items-center px-4">
          <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Loading your dashboard…</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="skeleton lg:col-span-2 h-72 rounded-2xl" />
          <div className="skeleton h-72 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
