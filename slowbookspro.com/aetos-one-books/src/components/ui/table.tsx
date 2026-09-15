import * as React from 'react'
import { cn } from '@/lib/utils'

const Table = ({ className, ...props }: React.ComponentProps<'table'>) => (
  <div className="relative w-full overflow-x-auto">
    <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
  </div>
)
const TableHeader = ({ className, ...props }: React.ComponentProps<'thead'>) => (
  <thead className={cn('[&_tr]:border-b', className)} {...props} />
)
const TableBody = ({ className, ...props }: React.ComponentProps<'tbody'>) => (
  <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
)
const TableFooter = ({ className, ...props }: React.ComponentProps<'tfoot'>) => (
  <tfoot className={cn('bg-muted/50 border-t font-medium', className)} {...props} />
)
const TableRow = ({ className, ...props }: React.ComponentProps<'tr'>) => (
  <tr
    className={cn(
      'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-accent',
      className,
    )}
    {...props}
  />
)
const TableHead = ({ className, numeric, ...props }: React.ComponentProps<'th'> & { numeric?: boolean }) => (
  <th
    data-numeric={numeric}
    className={cn(
      'text-muted-foreground h-9 px-3 text-left align-middle text-xs font-medium whitespace-nowrap',
      numeric && 'text-right',
      className,
    )}
    {...props}
  />
)
const TableCell = ({ className, numeric, ...props }: React.ComponentProps<'td'> & { numeric?: boolean }) => (
  <td
    data-numeric={numeric}
    className={cn('px-3 py-2 align-middle', numeric && 'num', className)}
    {...props}
  />
)
const TableCaption = ({ className, ...props }: React.ComponentProps<'caption'>) => (
  <caption className={cn('text-muted-foreground mt-3 text-sm', className)} {...props} />
)
export { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption }
