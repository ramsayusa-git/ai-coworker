'use client'
import * as React from 'react'
import * as C from '@radix-ui/react-checkbox'
import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const Checkbox = ({ className, ...props }: React.ComponentProps<typeof C.Root>) => (
  <C.Root
    className={cn(
      'peer border-input size-4 shrink-0 rounded-[4px] border shadow-xs outline-none transition',
      'data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground',
      'focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <C.Indicator className="flex items-center justify-center text-current">
      <CheckIcon className="size-3.5" />
    </C.Indicator>
  </C.Root>
)
export { Checkbox }
