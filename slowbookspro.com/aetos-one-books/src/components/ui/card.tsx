import * as React from 'react'
import { cn } from '@/lib/utils'

const Card = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    className={cn('bg-card text-card-foreground rounded-xl border shadow-xs', className)}
    {...props}
  />
)
const CardHeader = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div className={cn('flex flex-col gap-1 px-5 pt-5', className)} {...props} />
)
const CardTitle = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div className={cn('font-semibold leading-none tracking-tight', className)} {...props} />
)
const CardDescription = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div className={cn('text-muted-foreground text-sm', className)} {...props} />
)
const CardContent = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div className={cn('px-5 py-4', className)} {...props} />
)
const CardFooter = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div className={cn('flex items-center gap-2 px-5 pb-5', className)} {...props} />
)
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
