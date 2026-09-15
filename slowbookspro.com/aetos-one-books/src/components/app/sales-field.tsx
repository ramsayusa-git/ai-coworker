'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'

/**
 * One labelled control with its error message. The label is always a real
 * `<label for>`, and the error is wired to the control through
 * `aria-describedby` and announced, so a screen reader hears the problem at the
 * field rather than only in a toast.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string
  htmlFor: string
  error?: string | null
  hint?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="text-muted-foreground text-xs font-normal">required</span>
        )}
      </Label>
      <div aria-describedby={describedBy}>{children}</div>
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
