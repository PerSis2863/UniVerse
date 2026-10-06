/**
 * Shown while the session is being restored, so the dashboard never flashes a blank screen. Shaped
 * like the real shell on each screen size (on phones: the top bar, a large title, cards and the
 * floating tab bar), so nothing jumps or pops in when the app appears.
 */
export function AppSkeleton() {
  return (
    <div className="flex min-h-[100dvh]" aria-busy="true" aria-label="Loading">
      {/* Desktop: sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col gap-3 border-r border-zinc-200 dark:border-white/[0.06] bg-white/70 dark:bg-[#0a0d16]/70 p-4">
        <p className="h-10 flex items-center gap-2 mb-4 px-1 font-black text-lg text-zinc-900 dark:text-white"><span className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-sm flex items-center justify-center">U</span>UniVerse</p>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-9 rounded-xl" />
        ))}
      </aside>

      {/* Phones: the top bar */}
      <div className="mobile-header lg:hidden fixed top-0 inset-x-0 z-[35] flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-sm font-black flex items-center justify-center">U</span>
        <span className="font-bold text-[17px] tracking-tight text-zinc-900 dark:text-white">UniVerse</span>
      </div>

      <div className="mobile-main flex-1 lg:ml-64 min-w-0">
        <div className="px-4 pt-3 pb-2 lg:px-8 lg:pt-0 lg:h-16 lg:flex lg:flex-col lg:justify-center space-y-2">
          <div className="skeleton h-9 w-52 rounded-xl lg:h-6 lg:w-48" />
          <div className="skeleton h-3.5 w-64 rounded-lg" />
        </div>
        <div className="p-4 md:p-8 space-y-6">
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

      {/* Phones: the floating tab bar */}
      <div aria-hidden className="ios-tabbar ios-glass lg:hidden z-[35] p-1 grid grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="flex flex-col items-center justify-center gap-1.5">
            <span className="skeleton w-6 h-6 rounded-lg" />
            <span className="skeleton w-9 h-2 rounded" />
          </span>
        ))}
      </div>
    </div>
  );
}
