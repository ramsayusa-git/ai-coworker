import * as React from 'react'
import { cn } from '@/lib/utils'
export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'border-input flex min-h-16 w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs outline-none',
        'placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
