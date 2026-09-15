import { cn } from '@/lib/utils'

/**
 * Ledger logomark — an open ledger page with a running total tick.
 * Pure SVG so it inherits currentColor / theme tokens; the standalone
 * favicon (src/app/icon.svg) is a static copy of the same path data.
 */
export function LedgerMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('size-8', className)}
      role="img"
      aria-label="Ledger"
    >
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M9 9.5C9 8.67157 9.67157 8 10.5 8H21.5C22.3284 8 23 8.67157 23 9.5V22.5C23 23.3284 22.3284 24 21.5 24H10.5C9.67157 24 9 23.3284 9 22.5V9.5Z"
        className="fill-primary-foreground"
        fillOpacity="0.16"
      />
      <path
        d="M12 12.5H20M12 16H16.5"
        stroke="var(--brand-primary-fg, white)"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M12.25 20.25L14.5 22.5L20 16.5"
        stroke="var(--brand-primary-fg, white)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LedgerWordmark({
  className,
  markClassName,
  name = 'Ledger',
}: {
  className?: string
  markClassName?: string
  name?: string
}) {
  return (
    <span className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <LedgerMark className={cn('size-8 shrink-0', markClassName)} />
      <span className="text-[15px]">{name}</span>
    </span>
  )
}
