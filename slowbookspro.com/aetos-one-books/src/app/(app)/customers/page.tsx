import Link from 'next/link'
import { PlusIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { customerBalances } from '@/server/sales'
import { formatMoney } from '@/lib/money'
import {  } from '@/components/app/data-table'
import { listParams } from '@/lib/list-params'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import type { Prisma } from '@/generated/tenant/client'
import { CustomerTable, type CustomerRow } from './customer-table'

export const metadata = { title: 'Customers' }

/** Only these columns may drive the query — a sort key is user input. */
const SORTABLE = ['name', 'email', 'createdAt'] as const

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings, features } = await getAppContext()
  const params = await searchParams
  const { q, sort, dir, page, pageSize, skip } = listParams(params, { sort: 'name', dir: 'asc' })
  const currency = settings.get('base_currency') || 'USD'
  const noun = features.nonprofit ? 'donor' : 'customer'

  const show = typeof params.show === 'string' ? params.show : 'active'

  const where: Prisma.CustomerWhereInput = {
    ...(show === 'active' ? { isActive: true } : show === 'inactive' ? { isActive: false } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { companyName: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const field = (SORTABLE as readonly string[]).includes(sort) ? sort : 'name'
  const orderBy = { [field]: dir } as Prisma.CustomerOrderByWithRelationInput

  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
    }),
    db.customer.count({ where }),
  ])

  const balances = await customerBalances(db, customers.map((c) => c.id))
  const overdueIds = new Set(
    (
      await db.invoice.findMany({
        where: {
          customerId: { in: customers.map((c) => c.id) },
          status: { in: ['SENT', 'PARTIAL'] },
          balanceDue: { gt: 0 },
          dueDate: { lt: new Date() },
        },
        select: { customerId: true },
        distinct: ['customerId'],
      })
    ).map((row) => row.customerId),
  )

  const rows: CustomerRow[] = customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    companyName: customer.companyName,
    email: customer.email,
    phone: customer.phone,
    terms: customer.terms,
    isActive: customer.isActive,
    openBalance: formatMoney(balances.get(customer.id) ?? 0, currency),
    overdue: overdueIds.has(customer.id),
  }))

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={noun === 'donor' ? 'Donors' : 'Customers'}
        description={`Everyone you invoice, what they owe and how you reach them.`}
        actions={
          <Button asChild size="sm">
            <Link href="/customers/new"><PlusIcon /> New {noun}</Link>
          </Button>
        }
      />
      <CustomerTable
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        noun={noun}
        toolbar={
          <div className="flex items-center gap-1" role="group" aria-label="Filter by status">
            {(['active', 'all', 'inactive'] as const).map((value) => (
              <Button
                key={value}
                asChild
                size="sm"
                variant={show === value ? 'secondary' : 'ghost'}
              >
                <Link href={`/customers?show=${value}`} aria-current={show === value ? 'true' : undefined}>
                  {value === 'all' ? 'All' : value === 'active' ? 'Active' : 'Inactive'}
                </Link>
              </Button>
            ))}
          </div>
        }
      />
    </div>
  )
}
