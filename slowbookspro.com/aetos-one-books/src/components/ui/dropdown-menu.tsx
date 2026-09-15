'use client'
import * as React from 'react'
import * as M from '@radix-ui/react-dropdown-menu'
import { CheckIcon, ChevronRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const DropdownMenu = M.Root
const DropdownMenuTrigger = M.Trigger
const DropdownMenuGroup = M.Group
const DropdownMenuSub = M.Sub

const itemClass =
  "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4"

const DropdownMenuContent = ({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof M.Content>) => (
  <M.Portal>
    <M.Content
      sideOffset={sideOffset}
      className={cn(
        'bg-popover text-popover-foreground z-50 min-w-[10rem] overflow-hidden rounded-md border p-1 shadow-md',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
        className,
      )}
      {...props}
    />
  </M.Portal>
)
const DropdownMenuItem = ({ className, ...props }: React.ComponentProps<typeof M.Item>) => (
  <M.Item className={cn(itemClass, className)} {...props} />
)
const DropdownMenuCheckboxItem = ({ className, children, ...props }: React.ComponentProps<typeof M.CheckboxItem>) => (
  <M.CheckboxItem className={cn(itemClass, 'pl-8', className)} {...props}>
    <span className="absolute left-2 flex size-4 items-center justify-center">
      <M.ItemIndicator><CheckIcon className="size-4" /></M.ItemIndicator>
    </span>
    {children}
  </M.CheckboxItem>
)
const DropdownMenuLabel = ({ className, ...props }: React.ComponentProps<typeof M.Label>) => (
  <M.Label className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className)} {...props} />
)
const DropdownMenuSeparator = ({ className, ...props }: React.ComponentProps<typeof M.Separator>) => (
  <M.Separator className={cn('bg-border -mx-1 my-1 h-px', className)} {...props} />
)
const DropdownMenuShortcut = ({ className, ...props }: React.ComponentProps<'span'>) => (
  <span className={cn('text-muted-foreground ml-auto text-xs tracking-widest', className)} {...props} />
)
const DropdownMenuSubTrigger = ({ className, children, ...props }: React.ComponentProps<typeof M.SubTrigger>) => (
  <M.SubTrigger className={cn(itemClass, className)} {...props}>
    {children}
    <ChevronRightIcon className="ml-auto size-4" />
  </M.SubTrigger>
)
const DropdownMenuSubContent = ({ className, ...props }: React.ComponentProps<typeof M.SubContent>) => (
  <M.Portal>
    <M.SubContent className={cn('bg-popover z-50 min-w-[8rem] rounded-md border p-1 shadow-md', className)} {...props} />
  </M.Portal>
)

export {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuShortcut, DropdownMenuGroup, DropdownMenuSub,
  DropdownMenuSubTrigger, DropdownMenuSubContent,
}
