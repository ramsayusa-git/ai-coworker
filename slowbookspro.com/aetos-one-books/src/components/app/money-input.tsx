'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

/**
 * A text field for an amount, a rate or a quantity.
 *
 * It stays a *string* the whole time it is being typed — a half-typed "12." or
 * "0.0" survives, and nothing is coerced to a JS number on the way through, so
 * the value the server parses into a Decimal is exactly what the person typed.
 * Blurring normalises to a fixed number of decimal places.
 */
export function MoneyInput({
  value,
  onValueChange,
  places = 2,
  className,
  align = 'right',
  ...props
}: Omit<React.ComponentProps<'input'>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
  /** 2 for money, 4 for quantities and rates. */
  places?: number
  align?: 'left' | 'right'
}) {
  return (
    <Input
      {...props}
      value={value}
      inputMode="decimal"
      autoComplete="off"
      className={cn('num tabular-nums', align === 'right' && 'text-right', className)}
      onChange={(event) => {
        const next = event.target.value
        // Digits, one dot, an optional leading minus. Anything else is ignored
        // rather than silently rewritten under the caret.
        if (next === '' || /^-?\d*\.?\d*$/.test(next)) onValueChange(next)
      }}
      onFocus={(event) => {
        event.currentTarget.select()
        props.onFocus?.(event)
      }}
      onBlur={(event) => {
        const trimmed = value.trim()
        if (trimmed === '' || trimmed === '-') {
          onValueChange('')
        } else {
          const parsed = Number.parseFloat(trimmed)
          if (Number.isFinite(parsed)) onValueChange(parsed.toFixed(places))
        }
        props.onBlur?.(event)
      }}
    />
  )
}
