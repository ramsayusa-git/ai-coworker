import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  )
}
