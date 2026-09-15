'use client'
import * as React from 'react'
import { CheckIcon, ChevronsUpDownIcon, SearchIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export type EntityOption = {
  id: number
  label: string
  /** Second line: a rate, an email, an account — whatever disambiguates. */
  hint?: string
  /** Extra words that should match the filter without being displayed. */
  keywords?: string
}

/**
 * A searchable single-select for customers, items and accounts.
 *
 * It is a listbox, not a native `<select>`, because these lists are long and a
 * filter matters more than a system menu. Type to filter, arrow keys to move,
 * Enter to choose, Escape to close — and the trigger keeps the focus ring so
 * the keyboard path is never a dead end.
 */
export function EntityPicker({
  options,
  value,
  onSelect,
  placeholder = 'Select…',
  searchPlaceholder = 'Type to filter…',
  emptyLabel = 'No matches',
  id,
  disabled,
  className,
  allowClear,
  'aria-describedby': describedBy,
}: {
  options: EntityOption[]
  value: number | null
  onSelect: (id: number | null) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  id?: string
  disabled?: boolean
  className?: string
  allowClear?: boolean
  'aria-describedby'?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [active, setActive] = React.useState(0)
  const listId = React.useId()

  const selected = options.find((option) => option.id === value) ?? null

  const matches = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options.slice(0, 200)
    return options
      .filter((option) =>
        `${option.label} ${option.hint ?? ''} ${option.keywords ?? ''}`.toLowerCase().includes(needle),
      )
      .slice(0, 200)
  }, [options, query])

  React.useEffect(() => setActive(0), [query, open])

  const choose = (optionId: number | null) => {
    onSelect(optionId)
    setOpen(false)
    setQuery('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-describedby={describedBy}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground', className)}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <div className="relative border-b">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            aria-controls={listId}
            aria-activedescendant={matches[active] ? `${listId}-${matches[active].id}` : undefined}
            className="border-0 pl-8 shadow-none focus-visible:ring-0"
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((index) => Math.min(index + 1, matches.length - 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((index) => Math.max(index - 1, 0))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                const match = matches[active]
                if (match) choose(match.id)
              }
            }}
          />
        </div>
        <ul id={listId} role="listbox" className="max-h-72 overflow-y-auto p-1">
          {matches.length === 0 && (
            <li className="text-muted-foreground px-2 py-6 text-center text-sm">{emptyLabel}</li>
          )}
          {allowClear && selected && (
            <li>
              <button
                type="button"
                onClick={() => choose(null)}
                className="hover:bg-accent text-muted-foreground w-full rounded-md px-2 py-1.5 text-left text-sm"
              >
                Clear selection
              </button>
            </li>
          )}
          {matches.map((option, index) => (
            <li key={option.id}>
              <button
                id={`${listId}-${option.id}`}
                type="button"
                role="option"
                aria-selected={option.id === value}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                  index === active && 'bg-accent text-accent-foreground',
                )}
              >
                <CheckIcon
                  className={cn('size-4 shrink-0', option.id === value ? 'opacity-100' : 'opacity-0')}
                />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.hint && (
                  <span className="text-muted-foreground shrink-0 text-xs">{option.hint}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
