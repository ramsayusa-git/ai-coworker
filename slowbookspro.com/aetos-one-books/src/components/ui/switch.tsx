'use client'
import * as React from 'react'
import * as S from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

const Switch = ({ className, ...props }: React.ComponentProps<typeof S.Root>) => (
  <S.Root
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-colors outline-none',
      'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:ring-[3px] focus-visible:ring-ring/40',
      className,
    )}
    {...props}
  >
    <S.Thumb className="bg-background pointer-events-none block size-4 rounded-full ring-0 shadow-sm transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5" />
  </S.Root>
)
export { Switch }
