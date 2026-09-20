'use client';

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800/60",
        className
      )}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="w-12 h-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4 rounded" />
          <Skeleton className="h-3 w-1/2 rounded" />
        </div>
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
      <div className="flex justify-between">
        <Skeleton className="h-3 w-1/3 rounded" />
        <Skeleton className="h-3 w-1/4 rounded" />
      </div>
    </div>
  );
}

export function SkeletonKpiCard() {
  return (
    <div className="kpi-card space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24 rounded" />
        <Skeleton className="w-8 h-8 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-20 rounded" />
      <Skeleton className="h-3 w-16 rounded" />
    </div>
  );
}

export function SkeletonTableRow() {
  return (
    <tr className="border-b border-zinc-100 dark:border-white/[0.03]">
      <td className="py-4 px-4">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-48 rounded" />
          <Skeleton className="h-3 w-20 rounded" />
        </div>
      </td>
      <td className="py-4 px-4 text-center hidden sm:table-cell">
        <Skeleton className="h-4 w-8 rounded mx-auto" />
      </td>
      <td className="py-4 px-4">
        <div className="flex flex-col items-center gap-1">
          <Skeleton className="h-4 w-12 rounded" />
          <Skeleton className="h-1 w-16 rounded-full" />
        </div>
      </td>
      <td className="py-4 px-4">
        <Skeleton className="w-8 h-8 rounded-lg mx-auto" />
      </td>
    </tr>
  );
}

export function SkeletonGradeRow() {
  return (
    <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-white/[0.03]">
      <div className="flex items-center gap-3 flex-1">
        <Skeleton className="w-9 h-9 rounded-xl flex-shrink-0" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-4 w-40 rounded" />
          <Skeleton className="h-3 w-24 rounded" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="space-y-1 items-end flex flex-col">
          <Skeleton className="h-4 w-10 rounded" />
          <Skeleton className="h-1 w-16 rounded-full" />
        </div>
        <Skeleton className="w-8 h-8 rounded-lg" />
      </div>
    </div>
  );
}
