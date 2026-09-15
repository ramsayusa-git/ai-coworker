'use client'
import * as React from 'react'
import * as T from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

const Tabs = ({ className, ...props }: React.ComponentProps<typeof T.Root>) => (
  <T.Root className={cn('flex flex-col gap-4', className)} {...props} />
)
const TabsList = ({ className, ...props }: React.ComponentProps<typeof T.List>) => (
  <T.List className={cn('bg-muted text-muted-foreground inline-flex h-9 w-fit items-center rounded-lg p-1', className)} {...props} />
)
const TabsTrigger = ({ className, ...props }: React.ComponentProps<typeof T.Trigger>) => (
  <T.Trigger
    className={cn(
      'inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition',
      'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs',
      'focus-visible:ring-[3px] focus-visible:ring-ring/40 outline-none disabled:opacity-50',
      className,
    )}
    {...props}
  />
)
const TabsContent = ({ className, ...props }: React.ComponentProps<typeof T.Content>) => (
  <T.Content className={cn('flex-1 outline-none', className)} {...props} />
)
export { Tabs, TabsList, TabsTrigger, TabsContent }
