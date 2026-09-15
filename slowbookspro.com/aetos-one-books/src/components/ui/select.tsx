'use client'
import * as React from 'react'
import * as S from '@radix-ui/react-select'
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const Select = S.Root
const SelectGroup = S.Group
const SelectValue = S.Value

const SelectTrigger = ({ className, children, ...props }: React.ComponentProps<typeof S.Trigger>) => (
  <S.Trigger
    className={cn(
      "flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-xs outline-none",
      'focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50',
      "data-[placeholder]:text-muted-foreground [&_svg:not([class*='size-'])]:size-4",
      className,
    )}
    {...props}
  >
    {children}
    <S.Icon asChild><ChevronDownIcon className="size-4 opacity-60" /></S.Icon>
  </S.Trigger>
)

const SelectContent = ({ className, children, position = 'popper', ...props }: React.ComponentProps<typeof S.Content>) => (
  <S.Portal>
    <S.Content
      position={position}
      className={cn(
        'bg-popover text-popover-foreground relative z-50 max-h-72 min-w-[8rem] overflow-hidden rounded-md border shadow-md',
        position === 'popper' && 'data-[side=bottom]:translate-y-1',
        className,
      )}
      {...props}
    >
      <S.ScrollUpButton className="flex h-6 items-center justify-center"><ChevronUpIcon className="size-4" /></S.ScrollUpButton>
      <S.Viewport className={cn('p-1', position === 'popper' && 'w-full min-w-[var(--radix-select-trigger-width)]')}>
        {children}
      </S.Viewport>
      <S.ScrollDownButton className="flex h-6 items-center justify-center"><ChevronDownIcon className="size-4" /></S.ScrollDownButton>
    </S.Content>
  </S.Portal>
)

const SelectItem = ({ className, children, ...props }: React.ComponentProps<typeof S.Item>) => (
  <S.Item
    className={cn(
      'relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none select-none',
      'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <S.ItemText>{children}</S.ItemText>
    <span className="absolute right-2 flex size-4 items-center justify-center">
      <S.ItemIndicator><CheckIcon className="size-4" /></S.ItemIndicator>
    </span>
  </S.Item>
)

const SelectLabel = ({ className, ...props }: React.ComponentProps<typeof S.Label>) => (
  <S.Label className={cn('px-2 py-1.5 text-xs text-muted-foreground', className)} {...props} />
)
const SelectSeparator = ({ className, ...props }: React.ComponentProps<typeof S.Separator>) => (
  <S.Separator className={cn('bg-border -mx-1 my-1 h-px', className)} {...props} />
)

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem, SelectLabel, SelectSeparator }
