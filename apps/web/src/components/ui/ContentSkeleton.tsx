import { cn } from '@/lib/utils';

type Variant = 'grid' | 'list' | 'dashboard' | 'table' | 'chat';

const Block = ({ className }: { className?: string }) => <div className={cn('skeleton rounded-2xl', className)} />;

/** Page-shaped loading placeholder with a soft shimmer (replaces lone spinners). */
export function ContentSkeleton({ variant = 'list', className }: { variant?: Variant; className?: string }) {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className={cn('w-full self-stretch space-y-4', className)}>
      {variant === 'dashboard' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <Block key={i} className="h-28" />)}</div>
          <div className="grid lg:grid-cols-3 gap-4"><Block className="lg:col-span-2 h-72" /><Block className="h-72" /></div>
        </>
      )}
      {variant === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-3xl border border-zinc-200/60 dark:border-white/[0.05] p-5 space-y-3">
              <div className="flex items-center gap-3"><Block className="w-11 h-11 rounded-xl" /><div className="flex-1 space-y-2"><Block className="h-3.5 w-3/4 rounded-md" /><Block className="h-3 w-1/2 rounded-md" /></div></div>
              <Block className="h-3 w-full rounded-md" /><Block className="h-3 w-5/6 rounded-md" /><Block className="h-9 w-full rounded-xl mt-2" />
            </div>
          ))}
        </div>
      )}
      {(variant === 'list' || variant === 'table') && (
        <div className={cn(variant === 'table' && 'rounded-2xl border border-zinc-200/60 dark:border-white/[0.05] divide-y divide-zinc-200/60 dark:divide-white/[0.05]', variant === 'list' && 'space-y-3')}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={cn('flex items-center gap-3', variant === 'list' ? 'rounded-2xl border border-zinc-200/60 dark:border-white/[0.05] p-4' : 'p-4')}>
              <Block className="w-10 h-10 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2"><Block className="h-3.5 w-2/5 rounded-md" /><Block className="h-3 w-3/5 rounded-md" /></div>
              <Block className="h-6 w-14 rounded-full" />
            </div>
          ))}
        </div>
      )}
      {variant === 'chat' && (
        <div className="space-y-3 p-4">
          {['w-2/5', 'w-1/2 ml-auto', 'w-1/3', 'w-3/5 ml-auto', 'w-1/4', 'w-2/5 ml-auto'].map((w, i) => (
            <Block key={i} className={cn('h-10 rounded-[20px]', w, i % 2 ? 'rounded-br-md' : 'rounded-bl-md')} />
          ))}
        </div>
      )}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
