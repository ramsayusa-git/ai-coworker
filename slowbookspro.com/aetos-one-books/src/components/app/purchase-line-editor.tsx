'use client'
import * as React from 'react'
import { GripVerticalIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EntityPicker, type EntityOption } from '@/components/app/entity-picker'
import { MoneyInput } from '@/components/app/money-input'

/**
 * The line grid every purchase document shares — bills, purchase orders and
 * vendor credits.
 *
 * It is the sales grid's counterpart, with one difference that matters: a
 * purchase line names the account the cost lands in, where a sales line names
 * the tax treatment. Leaving the account blank is normal — the item, then the
 * vendor, then the catch-all decide it at posting time, and the placeholder
 * says so.
 *
 * Amounts stay strings the whole time they are being typed, so what the server
 * parses into a Decimal is exactly what the person entered.
 */

export type PurchaseLine = {
  /** Stable across re-orders; never sent to the server. */
  key: string
  itemId: number | null
  accountId: number | null
  description: string
  quantity: string
  rate: string
}

export type PurchaseItemOption = {
  id: number
  name: string
  description: string | null
  cost: string
  trackInventory: boolean
  quantityOnHand: string | null
  expenseAccountId: number | null
}

export type AccountOption = {
  id: number
  name: string
  accountNumber: string | null
}

let counter = 0
export const blankPurchaseLine = (): PurchaseLine => ({
  key: `pline-${(counter += 1)}-${Math.random().toString(36).slice(2, 8)}`,
  itemId: null,
  accountId: null,
  description: '',
  quantity: '1',
  rate: '',
})

const toNumber = (value: string) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Round each line to cents before summing — never the other way round. */
export const purchaseLineAmount = (line: PurchaseLine) =>
  Math.round(toNumber(line.quantity) * toNumber(line.rate) * 100) / 100

export function purchaseTotals(lines: PurchaseLine[], taxRatePercent: string) {
  const rate = toNumber(taxRatePercent) / 100
  let subtotal = 0
  for (const line of lines) subtotal += purchaseLineAmount(line)
  subtotal = Math.round(subtotal * 100) / 100
  const tax = Math.round(subtotal * rate * 100) / 100
  return { subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 }
}

/** A line the person started but never filled in is dropped, not rejected. */
export const usablePurchaseLines = (lines: PurchaseLine[]) =>
  lines.filter(
    (line) =>
      line.itemId !== null ||
      line.accountId !== null ||
      line.description.trim() !== '' ||
      toNumber(line.rate) !== 0,
  )

const COLUMNS = 6

export function PurchaseLineEditor({
  lines,
  onChange,
  items,
  accounts,
  showAccount = true,
  currency = 'USD',
  disabled,
}: {
  lines: PurchaseLine[]
  onChange: (lines: PurchaseLine[]) => void
  items: PurchaseItemOption[]
  accounts: AccountOption[]
  /** Purchase orders have no account column: nothing posts from them. */
  showAccount?: boolean
  currency?: string
  disabled?: boolean
}) {
  const gridRef = React.useRef<HTMLDivElement>(null)

  const itemOptions: EntityOption[] = React.useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        label: item.name,
        hint:
          item.trackInventory && item.quantityOnHand ? `${item.quantityOnHand} on hand` : undefined,
        keywords: item.description ?? '',
      })),
    [items],
  )

  const accountOptions: EntityOption[] = React.useMemo(
    () =>
      accounts.map((account) => ({
        id: account.id,
        label: account.name,
        hint: account.accountNumber ?? undefined,
        keywords: account.accountNumber ?? '',
      })),
    [accounts],
  )

  const patch = (index: number, changes: Partial<PurchaseLine>) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...changes } : line)))
  }

  const focusCell = React.useCallback((row: number, column: number) => {
    requestAnimationFrame(() => {
      const target = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${row}:${column}"]`)
      target?.focus()
    })
  }, [])

  const addLine = React.useCallback(
    (focus = true) => {
      const next = [...lines, blankPurchaseLine()]
      onChange(next)
      if (focus) focusCell(next.length - 1, 0)
    },
    [lines, onChange, focusCell],
  )

  const removeLine = (index: number) => {
    const next = lines.filter((_, i) => i !== index)
    onChange(next.length > 0 ? next : [blankPurchaseLine()])
    focusCell(Math.max(index - 1, 0), 0)
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
      rate: line.rate.trim() === '' || line.rate === '0.00' ? item.cost : line.rate,
      accountId: line.accountId,
    })
    focusCell(index, 1)
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
            Document lines. Use the arrow keys to move between cells, Enter to add a line, and Alt
            plus Backspace to remove one.
          </caption>
          <thead className="bg-muted/40 text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="w-8 px-2 py-2" aria-label="Line" />
              <th scope="col" className="min-w-44 px-2 py-2 text-left font-medium">Item</th>
              {showAccount && (
                <th scope="col" className="min-w-44 px-2 py-2 text-left font-medium">Account</th>
              )}
              <th scope="col" className="min-w-56 px-2 py-2 text-left font-medium">Description</th>
              <th scope="col" className="w-28 px-2 py-2 text-right font-medium">Qty</th>
              <th scope="col" className="w-32 px-2 py-2 text-right font-medium">Cost</th>
              <th scope="col" className="w-32 px-2 py-2 text-right font-medium">Amount</th>
              <th scope="col" className="w-10 px-2 py-2" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const item = items.find((candidate) => candidate.id === line.itemId)
              return (
                <tr key={line.key} className="border-b last:border-0">
                  <td className="text-muted-foreground px-2 py-1.5 text-center">
                    <GripVerticalIcon className="mx-auto size-3.5 opacity-40" aria-hidden />
                    <span className="sr-only">Line {index + 1}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <EntityPicker
                      options={itemOptions}
                      value={line.itemId}
                      onSelect={(itemId) => pickItem(index, itemId)}
                      placeholder="Optional"
                      searchPlaceholder="Filter items…"
                      emptyLabel="No item matches"
                      allowClear
                      disabled={disabled}
                      className="h-8 border-transparent shadow-none hover:border-input data-[state=open]:border-input"
                    />
                  </td>
                  {showAccount && (
                    <td className="px-2 py-1.5">
                      {item?.trackInventory ? (
                        <span className="text-muted-foreground block truncate px-2 text-xs">
                          Inventory asset
                        </span>
                      ) : (
                        <EntityPicker
                          options={accountOptions}
                          value={line.accountId}
                          onSelect={(accountId) => patch(index, { accountId })}
                          placeholder="From the item or vendor"
                          searchPlaceholder="Filter accounts…"
                          emptyLabel="No account matches"
                          allowClear
                          disabled={disabled}
                          className="h-8 border-transparent shadow-none hover:border-input data-[state=open]:border-input"
                        />
                      )}
                    </td>
                  )}
                  <td className="px-2 py-1.5">
                    <Input
                      data-cell={`${index}:0`}
                      value={line.description}
                      disabled={disabled}
                      onChange={(event) => patch(index, { description: event.target.value })}
                      placeholder="What was bought"
                      aria-label={`Description, line ${index + 1}`}
                      className="h-8 border-transparent shadow-none hover:border-input focus-visible:border-ring"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <MoneyInput
                      data-cell={`${index}:1`}
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
                      data-cell={`${index}:2`}
                      value={line.rate}
                      disabled={disabled}
                      onValueChange={(value) => patch(index, { rate: value })}
                      aria-label={`Unit cost, line ${index + 1}`}
                      className="h-8 border-transparent shadow-none hover:border-input focus-visible:border-ring"
                    />
                  </td>
                  <td className="num px-2 py-1.5 text-right tabular-nums">
                    {formatMoney(purchaseLineAmount(line), currency)}
                  </td>
                  <td className="px-2 py-1.5">
                    <Button
                      data-cell={`${index}:3`}
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
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => addLine()} disabled={disabled}>
          <PlusIcon /> Add line
        </Button>
        <p className="text-muted-foreground hidden text-xs sm:block">
          Enter adds a line · arrow keys move · Alt + Backspace removes
        </p>
      </div>
    </div>
  )
}
