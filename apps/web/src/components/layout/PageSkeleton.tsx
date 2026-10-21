// Placeholder for a portal page that is still loading (the sidebar, bars and tab bar stay). Shaped
// like the page that's coming, on each screen size, so nothing jumps when it arrives: home pages
// (figures and panels), lists (messages, notifications, people: rows with a picture and two lines),
// card grids (courses, projects, boards) and a course (its banner, then rows). Used by
// (dashboard)/loading.tsx, the start-up screen (AppSkeleton) and while a tapped page downloads
// (PendingPage).

export type SkeletonVariant = 'dashboard' | 'list' | 'cards' | 'detail';

/** Which placeholder fits a page, from its address. */
export function skeletonFor(path: string | null | undefined): SkeletonVariant {
  const p = path ?? '';
  if (/\/(blackboard|course)(\/|$)|\/courses\/[^/]+/.test(p)) return 'detail';
  if (/\/(inbox|calls|notifications|messages|assignments|quizzes|grades|attendance|students|users|approvals|audit|staff|people|leaderboard)(\/|$)/.test(p)) return 'list';
  if (/\/(courses|ngo-marketplace|boards|docs|sheets|slides|library|studio|tools|life|clubs|events|scholarships|internships)(\/|$)/.test(p)) return 'cards';
  return 'dashboard';
}

const Title = () => (
  <>
    {/* Phones: a large title, its line and the tab row */}
    <div className="lg:hidden px-4 pt-3 pb-2 space-y-2">
      <div className="skeleton h-9 w-52 rounded-xl" />
      <div className="skeleton h-3.5 w-64 rounded-lg" />
      <div className="skeleton h-9 w-full rounded-[11px] mt-3" />
    </div>
    {/* Larger screens: the title bar */}
    <div className="hidden lg:flex h-16 px-8 items-center justify-between">
      <div className="space-y-2">
        <div className="skeleton h-5 w-44 rounded-lg" />
        <div className="skeleton h-3 w-60 rounded-lg" />
      </div>
      <div className="skeleton h-9 w-56 rounded-[10px]" />
    </div>
  </>
);

/** A row of a list: a picture, a name and a line. */
const Row = ({ i }: { i: number }) => (
  <div className="flex items-center gap-3 p-3">
    <div className="skeleton w-11 h-11 rounded-full shrink-0" />
    <div className="flex-1 space-y-2 min-w-0">
      <div className="skeleton h-3.5 rounded-md" style={{ width: `${45 + ((i * 17) % 35)}%` }} />
      <div className="skeleton h-3 rounded-md" style={{ width: `${60 + ((i * 23) % 30)}%` }} />
    </div>
  </div>
);

export function PageSkeleton({ variant = 'dashboard' }: { variant?: SkeletonVariant }) {
  return (
    <div role="status" aria-label="Loading" className="skeleton-in flex flex-col flex-1 min-w-0">
      <Title />
      {variant === 'dashboard' && (
        <>
          <div className="lg:hidden p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[0, 1].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
            </div>
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}
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
        </>
      )}
      {variant === 'list' && (
        <div className="p-2 sm:p-4 lg:px-8 space-y-1">
          <div className="skeleton h-10 rounded-xl mx-2 mb-2" />
          {Array.from({ length: 8 }).map((_, i) => <Row key={i} i={i} />)}
        </div>
      )}
      {variant === 'cards' && (
        <div className="p-4 md:p-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className={`skeleton h-48 rounded-3xl ${i > 2 ? 'hidden md:block' : ''}`} />)}
        </div>
      )}
      {variant === 'detail' && (
        <div className="p-4 md:p-8 space-y-4">
          <div className="skeleton h-28 rounded-3xl" />
          <div className="flex gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-8 w-24 rounded-full" />)}</div>
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
      )}
    </div>
  );
}
