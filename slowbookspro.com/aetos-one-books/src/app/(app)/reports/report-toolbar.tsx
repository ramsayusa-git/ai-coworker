'use client'
import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Columns3Icon, DownloadIcon, PrinterIcon, RotateCcwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * The controls every report shares. Each one writes to the URL and nothing
 * else: a report anybody is looking at is a link they can send, and the CSV
 * export is the same query with a different extension.
 */

export type ToolbarOption = { id: number; name: string }

export type ReportToolbarProps = {
  reportId: string
  controls: string[]
  optionalColumns: { key: string; label: string }[]
  options: {
    classes: ToolbarOption[]
    jobs: ToolbarOption[]
    accounts: (ToolbarOption & { number: string })[]
    customers: ToolbarOption[]
    vendors: ToolbarOption[]
  }
  classLabel: string
  customerLabel: string
}

const PRESETS = [
  ['this-month', 'This month'],
  ['last-month', 'Last month'],
  ['this-quarter', 'This quarter'],
  ['last-quarter', 'Last quarter'],
  ['year-to-date', 'Year to date'],
  ['last-year', 'Last year'],
  ['custom', 'Custom dates'],
] as const

const NONE = '__none__'

export function ReportToolbar({
  reportId,
  controls,
  optionalColumns,
  options,
  classLabel,
  customerLabel,
}: ReportToolbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const has = (control: string) => controls.includes(control)
  const value = (key: string, fallback = '') => params.get(key) ?? fallback

  const push = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())
      for (const [key, v] of Object.entries(patch)) {
        if (v === null || v === '' || v === NONE) next.delete(key)
        else next.set(key, v)
      }
      const query = next.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [params, pathname, router],
  )

  const hidden = new Set(value('hide').split(',').filter(Boolean))
  const toggleColumn = (key: string) => {
    const next = new Set(hidden)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    push({ hide: [...next].join(',') || null })
  }

  const exportHref = `/api/reports/${reportId}/export${params.toString() ? `?${params.toString()}` : ''}`
  const dirty = params.toString().length > 0

  const picker = (
    key: string,
    label: string,
    items: ToolbarOption[],
    placeholder: string,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`report-${key}`} className="text-muted-foreground text-xs">
        {label}
      </Label>
      <Select value={value(key) || NONE} onValueChange={(next) => push({ [key]: next, page: null })}>
        <SelectTrigger id={`report-${key}`} className="w-52">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{placeholder}</SelectItem>
          {items.map((item) => (
            <SelectItem key={item.id} value={String(item.id)}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <div className="no-print bg-card space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-end gap-3">
        {has('range') && (
          <>
            <div className="space-y-1">
              <Label htmlFor="report-preset" className="text-muted-foreground text-xs">
                Period
              </Label>
              <Select
                value={value('preset', 'year-to-date')}
                onValueChange={(next) =>
                  push(next === 'custom' ? { preset: 'custom' } : { preset: next, from: null, to: null })
                }
              >
                <SelectTrigger id="report-preset" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map(([id, label]) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="report-from" className="text-muted-foreground text-xs">
                From
              </Label>
              <Input
                id="report-from"
                type="date"
                className="w-40"
                defaultValue={value('from')}
                onChange={(event) => push({ from: event.target.value, preset: 'custom' })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="report-to" className="text-muted-foreground text-xs">
                To
              </Label>
              <Input
                id="report-to"
                type="date"
                className="w-40"
                defaultValue={value('to')}
                onChange={(event) => push({ to: event.target.value, preset: 'custom' })}
              />
            </div>
          </>
        )}

        {has('asOf') && (
          <div className="space-y-1">
            <Label htmlFor="report-asof" className="text-muted-foreground text-xs">
              As of
            </Label>
            <Input
              id="report-asof"
              type="date"
              className="w-40"
              defaultValue={value('asOf')}
              onChange={(event) => push({ asOf: event.target.value })}
            />
          </div>
        )}

        {has('year') && (
          <div className="space-y-1">
            <Label htmlFor="report-year" className="text-muted-foreground text-xs">
              Tax year
            </Label>
            <Input
              id="report-year"
              type="number"
              inputMode="numeric"
              className="w-28"
              defaultValue={value('year', String(new Date().getUTCFullYear()))}
              onChange={(event) => push({ year: event.target.value })}
            />
          </div>
        )}

        {has('columns') && (
          <div className="space-y-1">
            <Label htmlFor="report-columns" className="text-muted-foreground text-xs">
              Columns
            </Label>
            <Select value={value('columns', 'total')} onValueChange={(next) => push({ columns: next })}>
              <SelectTrigger id="report-columns" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="total">Total only</SelectItem>
                <SelectItem value="month">By month</SelectItem>
                <SelectItem value="quarter">By quarter</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {has('compare') && (
          <div className="space-y-1">
            <Label htmlFor="report-compare" className="text-muted-foreground text-xs">
              Compare
            </Label>
            <Select value={value('compare', 'none')} onValueChange={(next) => push({ compare: next })}>
              <SelectTrigger id="report-compare" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No comparison</SelectItem>
                <SelectItem value="prior_period">Prior period</SelectItem>
                <SelectItem value="prior_year">Prior year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {has('account') && picker('account', 'Account', options.accounts.map((a) => ({
          id: a.id,
          name: a.number ? `${a.number} · ${a.name}` : a.name,
        })), 'All accounts')}

        {has('customer') && picker('customer', customerLabel, options.customers, `All ${customerLabel.toLowerCase()}s`)}
        {has('vendor') && picker('vendor', 'Vendor', options.vendors, 'All vendors')}

        {has('dimensions') && options.classes.length > 0 &&
          picker('class', classLabel, options.classes, `All ${classLabel.toLowerCase()}es`)}
        {has('dimensions') && options.jobs.length > 0 && picker('job', 'Job', options.jobs, 'All jobs')}

        <div className="ml-auto flex items-center gap-2">
          {optionalColumns.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Columns3Icon /> Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {optionalColumns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.key}
                    checked={!hidden.has(column.key)}
                    onCheckedChange={() => toggleColumn(column.key)}
                  >
                    {column.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button variant="outline" size="sm" asChild>
            <a href={exportHref} download>
              <DownloadIcon /> CSV
            </a>
          </Button>

          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <PrinterIcon /> Print
          </Button>

          {dirty && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.replace(pathname, { scroll: false })}
            >
              <RotateCcwIcon /> Reset
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
