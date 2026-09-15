import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-9 w-80" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  )
}
