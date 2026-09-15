import Link from 'next/link'
import { PlusIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { formatMoney, money, sum } from '@/lib/money'
import {  } from '@/components/app/data-table'
import { listParams } from '@/lib/list-params'
import { PageHeader } from '@/components/app/page-header'
import { isOverdue } from '@/components/app/document-status'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Prisma } from '@/generated/tenant/client'
import { InvoiceTable, type InvoiceRow } from './invoice-table'

export const metadata = { title: 'Invoices' }

const SORTABLE = ['invoiceNumber', 'date', 'dueDate', 'status', 'total', 'balanceDue'] as const

const FILTERS = [
  ['open', 'Open'],
  ['overdue', 'Overdue'],
  ['draft', 'Drafts'],
  ['paid', 'Paid'],
  ['all', 'All'],
] as const

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings, features } = await getAppContext()
  const params = await searchParams
  const { q, sort, dir, page, pageSize, skip } = listParams(params, { sort: 'date', dir: 'desc' })
  const currency = settings.get('base_currency') || 'USD'
  const label = features.nonprofit ? 'Pledge' : 'Invoice'

  const show = typeof params.show === 'string' ? params.show : 'open'
  const customerId = typeof params.customer === 'string' ? Number.parseInt(params.customer, 10) : null
  const today = new Date()
  const startOfToday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  )

  const statusFilter: Prisma.InvoiceWhereInput =
    show === 'open'
      ? { status: { in: ['SENT', 'PARTIAL'] }, balanceDue: { gt: 0 } }
      : show === 'overdue'
        ? { status: { in: ['SENT', 'PARTIAL'] }, balanceDue: { gt: 0 }, dueDate: { lt: startOfToday } }
        : show === 'draft'
          ? { status: 'DRAFT' }
          : show === 'paid'
            ? { status: 'PAID' }
            : {}

  const where: Prisma.InvoiceWhereInput = {
    ...statusFilter,
    ...(customerId && Number.isFinite(customerId) ? { customerId } : {}),
    ...(q
      ? {
          OR: [
            { invoiceNumber: { contains: q, mode: 'insensitive' as const } },
            { poNumber: { contains: q, mode: 'insensitive' as const } },
            { customer: { name: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const field = (SORTABLE as readonly string[]).includes(sort) ? sort : 'date'
  const orderBy: Prisma.InvoiceOrderByWithRelationInput[] = [{ [field]: dir }, { id: 'desc' }]

  const [invoices, total, openTotals] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: { customer: { select: { id: true, name: true } } },
    }),
    db.invoice.count({ where }),
    db.invoice.findMany({
      where: { status: { in: ['SENT', 'PARTIAL'] }, balanceDue: { gt: 0 } },
      select: { balanceDue: true, dueDate: true, status: true },
    }),
  ])

  const outstanding = sum(openTotals.map((row) => money(row.balanceDue.toString())))
  const overdueTotal = sum(
    openTotals
      .filter((row) => isOverdue(row.dueDate, row.balanceDue, row.status))
      .map((row) => money(row.balanceDue.toString())),
  )

  const rows: InvoiceRow[] = invoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customer.id,
    customerName: invoice.customer.name,
    date: invoice.date.toISOString().slice(0, 10),
    dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : null,
    status: invoice.status,
    overdue: isOverdue(invoice.dueDate, invoice.balanceDue, invoice.status),
    total: formatMoney(invoice.total.toString(), currency),
    balanceDue: formatMoney(invoice.balanceDue.toString(), currency),
  }))

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title={`${label}s`}
        description="What you have billed, what is still owed and what has gone past its due date."
        actions={
          <Button asChild size="sm">
            <Link href="/invoices/new"><PlusIcon /> New {label.toLowerCase()}</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Outstanding</p>
            <p className="num mt-1 text-xl font-semibold">{formatMoney(outstanding, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Overdue</p>
            <p
              className={`num mt-1 text-xl font-semibold ${
                overdueTotal.isPositive() ? 'text-destructive' : ''
              }`}
            >
              {formatMoney(overdueTotal, currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Showing</p>
            <p className="num mt-1 text-xl font-semibold">{total}</p>
          </CardContent>
        </Card>
      </div>

      <InvoiceTable
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        label={label}
        toolbar={
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter invoices">
            {FILTERS.map(([value, text]) => (
              <Button key={value} asChild size="sm" variant={show === value ? 'secondary' : 'ghost'}>
                <Link
                  href={`/invoices?show=${value}${customerId ? `&customer=${customerId}` : ''}`}
                  aria-current={show === value ? 'true' : undefined}
                >
                  {text}
                </Link>
              </Button>
            ))}
          </div>
        }
      />
    </div>
  )
}
