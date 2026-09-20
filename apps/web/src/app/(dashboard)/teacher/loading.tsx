import { Topbar } from '@/components/layout/Topbar';

export default function Loading() {
  return (
    <>
      <Topbar title="Loading..." subtitle="Getting things ready" />
      <div className="flex-1 flex flex-col overflow-hidden animate-pulse">
        <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-8 py-3 flex gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-10 w-32 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
          ))}
        </div>
        
        <div className="px-4 sm:px-8 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
            <div className="space-y-2">
              <div className="h-5 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
              <div className="h-3 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
            </div>
          </div>
        </div>

        <div className="flex-1 p-4 sm:p-8 bg-zinc-50 dark:bg-zinc-950/40">
          <div className="max-w-3xl mx-auto space-y-4 mt-6">
            <div className="h-6 w-40 bg-zinc-200 dark:bg-zinc-800 rounded mb-4" />
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
                <div className="flex justify-between">
                  <div className="h-5 w-1/3 bg-zinc-200 dark:bg-zinc-800 rounded" />
                  <div className="h-4 w-16 bg-zinc-200 dark:bg-zinc-800 rounded" />
                </div>
                <div className="h-4 w-full bg-zinc-200 dark:bg-zinc-800 rounded" />
                <div className="h-4 w-5/6 bg-zinc-200 dark:bg-zinc-800 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
