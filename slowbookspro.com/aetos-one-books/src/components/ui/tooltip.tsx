'use client'
import * as React from 'react'
import * as T from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

const TooltipProvider = ({ delayDuration = 200, ...props }: React.ComponentProps<typeof T.Provider>) => (
  <T.Provider delayDuration={delayDuration} {...props} />
)
const Tooltip = T.Root
const TooltipTrigger = T.Trigger
const TooltipContent = ({ className, sideOffset = 6, children, ...props }: React.ComponentProps<typeof T.Content>) => (
  <T.Portal>
    <T.Content
      sideOffset={sideOffset}
      className={cn('bg-foreground text-background z-50 rounded-md px-2 py-1 text-xs shadow-md', className)}
      {...props}
    >
      {children}
    </T.Content>
  </T.Portal>
)
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
