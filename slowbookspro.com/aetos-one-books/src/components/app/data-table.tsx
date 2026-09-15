'use client'
import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

/**
 * The list surface every module shares: URL-driven search, sort and paging, so
 * a filtered list is a link you can send to someone. Sorting and paging happen
 * on the server — the client never receives a table it did not ask for.
 */

export type Column<T> = {
  key: string
  header: string
  /** Sortable columns pass the server-side sort key. */
  sortKey?: string
  numeric?: boolean
  width?: string
  render: (row: T) => React.ReactNode
  /** Hide below this breakpoint to keep phones readable. */
  hideBelow?: 'sm' | 'md' | 'lg'
}

export type DataTableProps<T> = {
  rows: T[]
  columns: Column<T>[]
  total: number
  page: number
  pageSize: number
  rowKey: (row: T) => string | number
  /** Clicking a row navigates here. */
  rowHref?: (row: T) => string
  searchPlaceholder?: string
  empty?: React.ReactNode
  toolbar?: React.ReactNode
}

export function DataTable<T>({
  rows,
  columns,
  total,
  page,
  pageSize,
  rowKey,
  rowHref,
  searchPlaceholder = 'Search…',
  empty,
  toolbar,
}: DataTableProps<T>) {
  const router = useRouter()
  const params = useSearchParams()
  const [query, setQuery] = React.useState(params.get('q') ?? '')

  const sort = params.get('sort') ?? ''
  const dir = params.get('dir') === 'desc' ? 'desc' : 'asc'
  const pages = Math.max(1, Math.ceil(total / pageSize))

  const push = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k)
        else next.set(k, v)
      }
      router.push(`?${next.toString()}`, { scroll: false })
    },
    [params, router],
  )

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get('q') ?? '') !== query) push({ q: query || null, page: null })
    }, 250)
    return () => clearTimeout(timer)
  }, [query, params, push])

  const hideClass = (c: Column<T>) =>
    c.hideBelow === 'sm' ? 'hidden sm:table-cell'
      : c.hideBelow === 'md' ? 'hidden md:table-cell'
      : c.hideBelow === 'lg' ? 'hidden lg:table-cell'
      : ''

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8"
            aria-label="Search this list"
          />
        </div>
        {toolbar}
      </div>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              {columns.map((column) => {
                const active = column.sortKey && sort === column.sortKey
                return (
                  <TableHead
                    key={column.key}
                    numeric={column.numeric}
                    style={column.width ? { width: column.width } : undefined}
                    className={hideClass(column)}
                    aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {column.sortKey ? (
                      <button
                        type="button"
                        onClick={() =>
                          push({
                            sort: column.sortKey!,
                            dir: active && dir === 'asc' ? 'desc' : 'asc',
                            page: null,
                          })
                        }
                        className={cn(
                          'hover:text-foreground inline-flex items-center gap-1 transition-colors',
                          column.numeric && 'flex-row-reverse',
                          active && 'text-foreground',
                        )}
                      >
                        {column.header}
                        {active &&
                          (dir === 'asc' ? (
                            <ArrowUpIcon className="size-3" />
                          ) : (
                            <ArrowDownIcon className="size-3" />
                          ))}
                      </button>
                    ) : (
                      column.header
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="p-0">
                  {empty ?? (
                    <p className="text-muted-foreground py-12 text-center text-sm">
                      Nothing here yet.
                    </p>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  className={rowHref ? 'cursor-pointer' : undefined}
                  tabIndex={rowHref ? 0 : undefined}
                  onClick={rowHref ? () => router.push(rowHref(row)) : undefined}
                  onKeyDown={
                    rowHref
                      ? (e) => {
                          if (e.key === 'Enter') router.push(rowHref(row))
                        }
                      : undefined
                  }
                >
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      numeric={column.numeric}
                      className={hideClass(column)}
                    >
                      {column.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <span>
          {total === 0
            ? 'No records'
            : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => push({ page: String(page - 1) })}
            aria-label="Previous page"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="px-2">
            {page} / {pages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= pages}
            onClick={() => push({ page: String(page + 1) })}
            aria-label="Next page"
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

