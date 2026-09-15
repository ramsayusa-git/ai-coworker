'use client'
import * as React from 'react'
import { GripVerticalIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { EntityPicker, type EntityOption } from '@/components/app/entity-picker'
import { MoneyInput } from '@/components/app/money-input'

/**
 * The line grid shared by every sales document.
 *
 * It behaves like a spreadsheet on purpose: arrow keys move between cells,
 * Enter on the last row starts a new one, and nothing about the keyboard path
 * depends on the mouse. Amounts are plain strings until the server parses them
 * into Decimals, so no value is ever rounded through a float on the way.
 */

export type DocumentLine = {
  /** Stable across re-orders; never sent to the server. */
  key: string
  itemId: number | null
  description: string
  quantity: string
  rate: string
  isTaxable: boolean
}

export type LineItemOption = {
  id: number
  name: string
  description: string | null
  rate: string
  isTaxable: boolean
  trackInventory: boolean
  quantityOnHand: string | null
  accountName: string | null
}

let counter = 0
export const blankLine = (): DocumentLine => ({
  key: `line-${(counter += 1)}-${Math.random().toString(36).slice(2, 8)}`,
  itemId: null,
  description: '',
  quantity: '1',
  rate: '',
  isTaxable: true,
})

const toNumber = (value: string) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Round each line to cents before summing — never the other way round. */
export const lineAmount = (line: DocumentLine) =>
  Math.round(toNumber(line.quantity) * toNumber(line.rate) * 100) / 100

export function documentTotals(lines: DocumentLine[], taxRatePercent: string) {
  const rate = toNumber(taxRatePercent) / 100
  let subtotal = 0
  let taxable = 0
  for (const line of lines) {
    const amount = lineAmount(line)
    subtotal += amount
    if (line.isTaxable) taxable += amount
  }
  subtotal = Math.round(subtotal * 100) / 100
  taxable = Math.round(taxable * 100) / 100
  const tax = Math.round(taxable * rate * 100) / 100
  return { subtotal, taxableSubtotal: taxable, tax, total: Math.round((subtotal + tax) * 100) / 100 }
}

const COLUMNS = 6

export function LineItemEditor({
  lines,
  onChange,
  items,
  showTax = true,
  currency = 'USD',
  disabled,
}: {
  lines: DocumentLine[]
  onChange: (lines: DocumentLine[]) => void
  items: LineItemOption[]
  showTax?: boolean
  currency?: string
  disabled?: boolean
}) {
  const gridRef = React.useRef<HTMLDivElement>(null)

  const options: EntityOption[] = React.useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        label: item.name,
        hint: item.trackInventory && item.quantityOnHand ? `${item.quantityOnHand} on hand` : undefined,
        keywords: `${item.description ?? ''} ${item.accountName ?? ''}`,
      })),
    [items],
  )

  const patch = (index: number, changes: Partial<DocumentLine>) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...changes } : line)))
  }

  const focusCell = React.useCallback((row: number, column: number) => {
    requestAnimationFrame(() => {
      const target = gridRef.current?.querySelector<HTMLElement>(
        `[data-cell="${row}:${column}"]`,
      )
      target?.focus()
    })
  }, [])

  const addLine = React.useCallback(
    (focus = true) => {
      const next = [...lines, blankLine()]
      onChange(next)
      if (focus) focusCell(next.length - 1, 0)
    },
    [lines, onChange, focusCell],
  )

  const removeLine = (index: number) => {
    const next = lines.filter((_, i) => i !== index)
    onChange(next.length > 0 ? next : [blankLine()])
    focusCell(Math.max(index - 1, 0), 1)
  }

  const pickItem = (index: number, itemId: number | null) => {
    if (itemId == null) {
      patch(index, { itemId: null })
      return
    }
    const item = items.find((candidate) => candidate.id === itemId)
    if (!item) return
    const line = lines[index]
    // Fill only what the person has not already written themselves.
    patch(index, {
      itemId,
      description: line.description.trim() === '' ? (item.description ?? item.name) : line.description,
      rate: line.rate.trim() === '' || line.rate === '0.00' ? item.rate : line.rate,
      isTaxable: item.isTaxable && line.isTaxable,
    })
    focusCell(index, 2)
  }

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-cell]')
    if (!cell) return
    const [row, column] = cell.dataset.cell!.split(':').map(Number)

    if (event.key === 'ArrowDown' && !event.shiftKey) {
      if (row < lines.length - 1) {
        event.preventDefault()
        focusCell(row + 1, column)
      }
    } else if (event.key === 'ArrowUp' && !event.shiftKey) {
      if (row > 0) {
        event.preventDefault()
        focusCell(row - 1, column)
      }
    } else if (event.key === 'Enter' && !event.shiftKey) {
      // Enter never submits from inside the grid: it walks down, and starts a
      // new line at the bottom.
      event.preventDefault()
      if (row === lines.length - 1) addLine()
      else focusCell(row + 1, column)
    } else if (event.key === 'Backspace' && (event.altKey || event.metaKey)) {
      event.preventDefault()
      removeLine(row)
    } else if (event.key === 'ArrowRight' && event.altKey) {
      event.preventDefault()
      focusCell(row, Math.min(column + 1, COLUMNS - 1))
    } else if (event.key === 'ArrowLeft' && event.altKey) {
      event.preventDefault()
      focusCell(row, Math.max(column - 1, 0))
    }
  }

  return (
    <div className="space-y-2">
      <div ref={gridRef} onKeyDown={onGridKeyDown} className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-3xl text-sm">
          <caption className="sr-only">
            Document lines. Use the arrow keys to move between cells, Enter to add a line, and
            Alt plus Backspace to remove one.
          </caption>
          <thead className="bg-muted/40 text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="w-8 px-2 py-2" aria-label="Line" />
              <th scope="col" className="min-w-48 px-2 py-2 text-left font-medium">Item</th>
              <th scope="col" className="min-w-64 px-2 py-2 text-left font-medium">Description</th>
              <th scope="col" className="w-28 px-2 py-2 text-right font-medium">Qty</th>
              <th scope="col" className="w-32 px-2 py-2 text-right font-medium">Rate</th>
              {showTax && (
                <th scope="col" className="w-16 px-2 py-2 text-center font-medium">Tax</th>
              )}
              <th scope="col" className="w-32 px-2 py-2 text-right font-medium">Amount</th>
              <th scope="col" className="w-10 px-2 py-2" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.key} className="border-b last:border-0">
                <td className="text-muted-foreground px-2 py-1.5 text-center">
                  <GripVerticalIcon className="mx-auto size-3.5 opacity-40" aria-hidden />
                  <span className="sr-only">Line {index + 1}</span>
                </td>
                <td className="px-2 py-1.5">
                  <EntityPicker
                    options={options}
                    value={line.itemId}
                    onSelect={(itemId) => pickItem(index, itemId)}
                    placeholder="Choose an item"
                    searchPlaceholder="Filter items…"
                    emptyLabel="No item matches"
                    allowClear
                    disabled={disabled}
                    className="h-8 border-transparent shadow-none hover:border-input data-[state=open]:border-input"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    data-cell={`${index}:1`}
                    value={line.description}
                    disabled={disabled}
                    onChange={(event) => patch(index, { description: event.target.value })}
                    placeholder="What was sold"
                    aria-label={`Description, line ${index + 1}`}
                    className="h-8 border-transparent shadow-none hover:border-input focus-visible:border-ring"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <MoneyInput
                    data-cell={`${index}:2`}
                    value={line.quantity}
                    places={4}
                    disabled={disabled}
                    onValueChange={(value) => patch(index, { quantity: value })}
                    aria-label={`Quantity, line ${index + 1}`}
                    className="h-8 border-transparent shadow-none hover:border-input focus-visible:border-ring"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <MoneyInput
                    data-cell={`${index}:3`}
                    value={line.rate}
                    disabled={disabled}
                    onValueChange={(value) => patch(index, { rate: value })}
                    aria-label={`Rate, line ${index + 1}`}
                    className="h-8 border-transparent shadow-none hover:border-input focus-visible:border-ring"
                  />
                </td>
                {showTax && (
                  <td className="px-2 py-1.5 text-center">
                    <Checkbox
                      data-cell={`${index}:4`}
                      checked={line.isTaxable}
                      disabled={disabled}
                      onCheckedChange={(checked) => patch(index, { isTaxable: checked === true })}
                      aria-label={`Charge sales tax on line ${index + 1}`}
                    />
                  </td>
                )}
                <td className="num px-2 py-1.5 text-right tabular-nums">
                  {formatMoney(lineAmount(line), currency)}
                </td>
                <td className="px-2 py-1.5">
                  <Button
                    data-cell={`${index}:5`}
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={disabled}
                    onClick={() => removeLine(index)}
                    aria-label={`Remove line ${index + 1}`}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => addLine()} disabled={disabled}>
          <PlusIcon /> Add line
        </Button>
        <p className={cn('text-muted-foreground hidden text-xs sm:block')}>
          Enter adds a line · arrow keys move · Alt + Backspace removes
        </p>
      </div>
    </div>
  )
}
