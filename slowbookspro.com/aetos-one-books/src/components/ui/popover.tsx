'use client'
import * as React from 'react'
import * as P from '@radix-ui/react-popover'
import { cn } from '@/lib/utils'

const Popover = P.Root
const PopoverTrigger = P.Trigger
const PopoverAnchor = P.Anchor
const PopoverContent = ({ className, align = 'start', sideOffset = 6, ...props }: React.ComponentProps<typeof P.Content>) => (
  <P.Portal>
    <P.Content
      align={align}
      sideOffset={sideOffset}
      className={cn('bg-popover text-popover-foreground z-50 w-72 rounded-md border p-3 shadow-md outline-none', className)}
      {...props}
    />
  </P.Portal>
)
export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
