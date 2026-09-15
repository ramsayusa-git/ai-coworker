import 'server-only'
import { Decimal } from 'decimal.js'
import { ZERO } from '@/lib/money'
import type { TenantClient } from '@/lib/tenant-db'
import { apAging, arAging } from './financials'
import {
  accountRegister,
  cashFlowStatement,
  balanceSheetStatement,
  generalLedger,
  profitAndLossStatement,
  sourceHref,
  trialBalanceReport,
} from './statements'
import { arDetail, customerStatement, openInvoices, salesByCustomer, salesByItem } from './sales'
import {
  PURCHASING_PENDING_NOTE,
  apDetail,
  expensesByCategory,
  expensesByVendor,
  openBills,
  summary1099,
} from './purchases'
import { cogsByItem, inventoryValuation, stockStatus } from './inventory'
import {
  type ReportQuery,
  asOfLabel,
  isoDate,
  periodLabel,
  registerHref,
} from './params'
import {
  type Cell,
  type ReportColumn,
  type ReportResult,
  type ReportRow,
  type ReportSection,
  amount,
  blank,
  count,
  day,
  percent,
  row,
  text,
} from './types'

/**
 * The report catalogue.
 *
 * Every report is a definition: which controls it needs, and a builder that
 * turns the tenant client plus the parsed query into one `ReportResult`. The
 * index page lists these, the `[report]` page renders one, and the CSV route
 * serialises the same value — so there is exactly one description of what
 * "sales by customer" means.
 */

export type ReportControl =
  | 'range'
  | 'asOf'
  | 'columns'
  | 'compare'
  | 'dimensions'
  | 'account'
  | 'customer'
  | 'vendor'
  | 'year'

export type ReportFamily = 'statements' | 'sales' | 'purchases' | 'inventory'

export type ReportContext = {
  db: TenantClient
  query: ReportQuery
  currency: string
  terms: { customer: string; invoice: string; netIncome: string; equity: string; class: string }
}

export type ReportDefinition = {
  id: string
  title: string
  description: string
  family: ReportFamily
  controls: ReportControl[]
  build: (ctx: ReportContext) => Promise<ReportResult>
}

export const FAMILIES: { id: ReportFamily; title: string; description: string }[] = [
  {
    id: 'statements',
    title: 'Financial statements',
    description: 'The ledger as the accountant reads it: position, performance and cash.',
  },
  {
    id: 'sales',
    title: 'Sales and receivables',
    description: 'What was sold, to whom, and what is still owed.',
  },
  {
    id: 'purchases',
    title: 'Purchases and payables',
    description: 'Where money went, what is still due, and what has to be reported.',
  },
  {
    id: 'inventory',
    title: 'Inventory',
    description: 'What is on hand, what it is worth and what it cost to sell.',
  },
]

const money2 = (value: Decimal) => amount(value)

/** Columns for a statement whose period layout is chosen in the toolbar. */
function periodColumns(
  labelHeader: string,
  columns: { key: string; label: string; role: string }[],
): ReportColumn[] {
  return [
    { key: 'name', label: labelHeader },
    ...columns.map((column) => ({
      key: column.key,
      label: column.label,
      numeric: true,
      group: column.role === 'period' ? 'Period' : undefined,
    })),
  ]
}

function statementSection(
  key: string,
  title: string,
  lines: {
    accountId: number | null
    accountNumber: string
    name: string
    amounts: Record<string, Decimal>
  }[],
  totals: Record<string, Decimal>,
  totalLabel: string,
  columns: ReportColumn[],
  periods: { key: string; from: Date; to: Date; role: string }[],
  query: ReportQuery,
): ReportSection {
  const rows: ReportRow[] = lines.map((line) => {
    const cells: Record<string, Cell> = {
      name: text(line.accountNumber ? `${line.accountNumber} · ${line.name}` : line.name),
    }
    for (const period of periods) {
      const value = line.amounts[period.key] ?? ZERO
      cells[period.key] =
        period.role === 'variance-percent'
          ? (line.amounts.compare ?? ZERO).isZero()
            ? blank
            : percent(value)
          : line.accountId != null && period.role !== 'variance'
            ? amount(value, registerHref(line.accountId, period.from, period.to, query))
            : amount(value)
    }
    return { key: `${key}-${line.accountId ?? line.name}`, cells, level: 1 }
  })

  const footerCells: Record<string, Cell> = { name: text(totalLabel) }
  for (const period of periods) {
    footerCells[period.key] =
      period.role === 'variance-percent'
        ? (totals.compare ?? ZERO).isZero()
          ? blank
          : percent(totals[period.key] ?? ZERO)
        : money2(totals[period.key] ?? ZERO)
  }

  return {
    key,
    title,
    rows: rows.length ? rows : [row(`${key}-none`, columns, { name: text('No activity') })],
    footer: { key: `${key}-total`, cells: footerCells, emphasis: 'subtotal' },
  }
}

const profitAndLoss: ReportDefinition = {
  id: 'profit-and-loss',
  title: 'Profit and loss',
  description: 'Income, cost of goods sold and expenses for a period, by month if you want it.',
  family: 'statements',
  controls: ['range', 'columns', 'compare', 'dimensions'],
  build: async ({ db, query, currency, terms }) => {
    const statement = await profitAndLossStatement(db, {
      from: query.from,
      to: query.to,
      columns: query.columns,
      compare: query.compare,
      classId: query.classId,
      jobId: query.jobId,
    })
    const periods = statement.columns
    const columns = periodColumns('Account', periods)

    const totalRow = (key: string, label: string, values: Record<string, Decimal>, emphasis: ReportRow['emphasis']) => {
      const cells: Record<string, Cell> = { name: text(label) }
      for (const period of periods) {
        cells[period.key] =
          period.role === 'variance-percent'
            ? (values.compare ?? ZERO).isZero()
              ? blank
              : percent(values[period.key] ?? ZERO)
            : money2(values[period.key] ?? ZERO)
      }
      return { key, cells, emphasis }
    }

    const sections: ReportSection[] = [
      statementSection('income', terms.netIncome === 'Change in net assets' ? 'Revenue and support' : 'Income', statement.income, statement.totals.income, 'Total income', columns, periods, query),
      statementSection('cogs', 'Cost of goods sold', statement.cogs, statement.totals.cogs, 'Total cost of goods sold', columns, periods, query),
      { key: 'gross', rows: [totalRow('gross-profit', 'Gross profit', statement.totals.grossProfit, 'subtotal')] },
      statementSection('expenses', 'Expenses', statement.expenses, statement.totals.expenses, 'Total expenses', columns, periods, query),
      { key: 'net', rows: [totalRow('net-income', terms.netIncome, statement.totals.netIncome, 'total')] },
    ]

    return {
      id: 'profit-and-loss',
      title: terms.netIncome === 'Change in net assets' ? 'Statement of activities' : 'Profit and loss',
      subtitle: periodLabel(query.from, query.to),
      columns,
      sections,
      currency,
      empty: statement.income.length + statement.cogs.length + statement.expenses.length === 0,
      highlights: [
        { label: 'Total income', value: statement.totals.income.total.toFixed(2) },
        { label: 'Gross profit', value: statement.totals.grossProfit.total.toFixed(2) },
        {
          label: terms.netIncome,
          value: statement.totals.netIncome.total.toFixed(2),
          tone: statement.totals.netIncome.total.isNegative() ? 'negative' : 'positive',
        },
      ],
    }
  },
}

const balanceSheet: ReportDefinition = {
  id: 'balance-sheet',
  title: 'Balance sheet',
  description: 'Assets, liabilities and equity as of a date, with the period result folded in.',
  family: 'statements',
  controls: ['asOf', 'compare', 'dimensions'],
  build: async ({ db, query, currency, terms }) => {
    const statement = await balanceSheetStatement(db, {
      asOf: query.asOf,
      compare: query.compare,
      classId: query.classId,
      jobId: query.jobId,
      netIncomeLabel: terms.netIncome,
    })
    const periods = statement.columns
    const columns = periodColumns('Account', periods)

    const totalRow = (key: string, label: string, values: Record<string, Decimal>, emphasis: ReportRow['emphasis']) => {
      const cells: Record<string, Cell> = { name: text(label) }
      for (const period of periods) cells[period.key] = money2(values[period.key] ?? ZERO)
      return { key, cells, emphasis }
    }

    const sections: ReportSection[] = [
      statementSection('assets', 'Assets', statement.assets, statement.totals.assets, 'Total assets', columns, periods, query),
      statementSection('liabilities', 'Liabilities', statement.liabilities, statement.totals.liabilities, 'Total liabilities', columns, periods, query),
      statementSection('equity', terms.equity, statement.equity, statement.totals.equity, `Total ${terms.equity.toLowerCase()}`, columns, periods, query),
      {
        key: 'combined',
        rows: [
          totalRow('liab-equity', `Liabilities and ${terms.equity.toLowerCase()}`, statement.totals.liabilitiesAndEquity, 'total'),
          ...(statement.totals.outOfBalance.total.isZero()
            ? []
            : [totalRow('out-of-balance', 'Out of balance', statement.totals.outOfBalance, 'subtotal')]),
        ],
      },
    ]

    return {
      id: 'balance-sheet',
      title: terms.equity === 'Net assets' ? 'Statement of financial position' : 'Balance sheet',
      subtitle: asOfLabel(query.asOf),
      columns,
      sections,
      currency,
      empty: statement.assets.length + statement.liabilities.length + statement.equity.length === 0,
      notes: statement.totals.outOfBalance.total.isZero()
        ? undefined
        : ['This balance sheet does not balance. Check the trial balance for the period.'],
    }
  },
}

const cashFlow: ReportDefinition = {
  id: 'cash-flow',
  title: 'Cash flow',
  description: 'Where cash came from and went, by operating, investing and financing activity.',
  family: 'statements',
  controls: ['range', 'dimensions'],
  build: async ({ db, query, currency }) => {
    const statement = await cashFlowStatement(db, {
      from: query.from,
      to: query.to,
      classId: query.classId,
      jobId: query.jobId,
    })
    const columns: ReportColumn[] = [
      { key: 'name', label: 'Account' },
      { key: 'amount', label: 'Amount', numeric: true },
    ]

    const section = (
      key: string,
      title: string,
      rows: { accountId: number; accountNumber: string; name: string; amount: Decimal }[],
      total: Decimal,
    ): ReportSection => ({
      key,
      title,
      rows: rows.length
        ? rows.map((line) => ({
            key: `${key}-${line.accountId}`,
            level: 1,
            cells: {
              name: text(line.accountNumber ? `${line.accountNumber} · ${line.name}` : line.name),
              amount: amount(line.amount, registerHref(line.accountId, query.from, query.to, query)),
            },
          }))
        : [row(`${key}-none`, columns, { name: text('No activity') })],
      footer: {
        key: `${key}-total`,
        emphasis: 'subtotal',
        cells: { name: text(`Net cash from ${title.toLowerCase()}`), amount: money2(total) },
      },
    })

    return {
      id: 'cash-flow',
      title: 'Statement of cash flows',
      subtitle: periodLabel(query.from, query.to),
      columns,
      currency,
      sections: [
        {
          key: 'opening',
          rows: [
            row('opening-cash', columns, {
              name: text('Cash at start of period'),
              amount: money2(statement.openingCash),
            }),
          ],
        },
        section('operating', 'Operating activities', statement.operating, statement.totalOperating),
        section('investing', 'Investing activities', statement.investing, statement.totalInvesting),
        section('financing', 'Financing activities', statement.financing, statement.totalFinancing),
        {
          key: 'net',
          rows: [
            { key: 'net-change', emphasis: 'subtotal', cells: { name: text('Net change in cash'), amount: money2(statement.netChange) } },
            { key: 'closing-cash', emphasis: 'total', cells: { name: text('Cash at end of period'), amount: money2(statement.closingCash) } },
          ],
        },
      ],
      empty:
        statement.operating.length + statement.investing.length + statement.financing.length === 0,
      notes: ['Built from the non-cash side of every entry that touched a bank account. Credit-card balances are a liability, not cash.'],
    }
  },
}

const trialBalance: ReportDefinition = {
  id: 'trial-balance',
  title: 'Trial balance',
  description: 'Every account with a balance, debits against credits, and the difference.',
  family: 'statements',
  controls: ['range', 'dimensions'],
  build: async ({ db, query, currency }) => {
    const report = await trialBalanceReport(db, {
      from: query.from,
      to: query.to,
      classId: query.classId,
      jobId: query.jobId,
    })
    const columns: ReportColumn[] = [
      { key: 'number', label: 'Number', width: '7rem' },
      { key: 'name', label: 'Account' },
      { key: 'type', label: 'Type', optional: true },
      { key: 'debit', label: 'Debit', numeric: true },
      { key: 'credit', label: 'Credit', numeric: true },
    ]

    return {
      id: 'trial-balance',
      title: 'Trial balance',
      subtitle: periodLabel(query.from, query.to),
      columns,
      currency,
      empty: report.rows.length === 0,
      sections: [
        {
          key: 'accounts',
          rows: report.rows.map((line) => ({
            key: `tb-${line.accountId}`,
            href: registerHref(line.accountId, query.from, query.to, query),
            cells: {
              number: text(line.accountNumber || '—'),
              name: text(line.name),
              type: text(line.type.toLowerCase()),
              debit: line.debit.isZero() ? blank : money2(line.debit),
              credit: line.credit.isZero() ? blank : money2(line.credit),
            },
          })),
          footer: {
            key: 'tb-total',
            emphasis: 'total',
            cells: {
              number: blank,
              name: text('Totals'),
              type: blank,
              debit: money2(report.totalDebit),
              credit: money2(report.totalCredit),
            },
          },
        },
      ],
      notes: report.difference.isZero()
        ? undefined
        : [`Debits and credits differ by ${report.difference.toFixed(2)}. The ledger should never allow this — check for a failed posting.`],
    }
  },
}

const generalLedgerReport: ReportDefinition = {
  id: 'general-ledger',
  title: 'General ledger',
  description: 'Every posting in the period, grouped by account, with running balances.',
  family: 'statements',
  controls: ['range', 'account', 'dimensions'],
  build: async ({ db, query, currency }) => {
    const accounts = await generalLedger(db, {
      from: query.from,
      to: query.to,
      accountId: query.accountId,
      classId: query.classId,
      jobId: query.jobId,
    })
    const columns: ReportColumn[] = [
      { key: 'date', label: 'Date', width: '7rem' },
      { key: 'reference', label: 'Reference', optional: true },
      { key: 'description', label: 'Description' },
      { key: 'debit', label: 'Debit', numeric: true },
      { key: 'credit', label: 'Credit', numeric: true },
      { key: 'balance', label: 'Balance', numeric: true },
    ]

    return {
      id: 'general-ledger',
      title: 'General ledger',
      subtitle: periodLabel(query.from, query.to),
      columns,
      currency,
      empty: accounts.length === 0,
      sections: accounts.map((account) => ({
        key: `gl-${account.accountId}`,
        title: `${account.accountNumber ? `${account.accountNumber} · ` : ''}${account.name}`,
        rows: [
          row(`gl-${account.accountId}-opening`, columns, {
            description: text('Opening balance'),
            balance: money2(account.opening),
          }),
          ...account.entries.map((entry) => ({
            key: `gl-${account.accountId}-${entry.lineId}`,
            href: registerHref(account.accountId, query.from, query.to, query),
            cells: {
              date: day(entry.date),
              reference: text(entry.reference || '—'),
              description: text(entry.description || '—'),
              debit: entry.debit.isZero() ? blank : money2(entry.debit),
              credit: entry.credit.isZero() ? blank : money2(entry.credit),
              balance: money2(entry.balance),
            },
          })),
        ],
        footer: {
          key: `gl-${account.accountId}-total`,
          emphasis: 'subtotal',
          cells: {
            date: blank,
            reference: blank,
            description: text(`Total for ${account.name}`),
            debit: money2(account.totalDebit),
            credit: money2(account.totalCredit),
            balance: money2(account.closing),
          },
        },
      })),
    }
  },
}

const registerReport: ReportDefinition = {
  id: 'account-register',
  title: 'Account register',
  description: 'One account, line by line, with a running balance — where every figure drills to.',
  family: 'statements',
  controls: ['range', 'account', 'dimensions'],
  build: async ({ db, query, currency }) => {
    const columns: ReportColumn[] = [
      { key: 'date', label: 'Date', width: '7rem' },
      { key: 'source', label: 'Type', optional: true },
      { key: 'reference', label: 'Reference', optional: true },
      { key: 'description', label: 'Description' },
      { key: 'debit', label: 'Debit', numeric: true },
      { key: 'credit', label: 'Credit', numeric: true },
      { key: 'balance', label: 'Balance', numeric: true },
    ]

    if (query.accountId == null) {
      return {
        id: 'account-register',
        title: 'Account register',
        subtitle: periodLabel(query.from, query.to),
        columns,
        currency,
        sections: [],
        empty: true,
        notes: ['Choose an account to see its register.'],
      }
    }

    const register = await accountRegister(db, {
      accountId: query.accountId,
      from: query.from,
      to: query.to,
      classId: query.classId,
      jobId: query.jobId,
    })

    if (!register) {
      return {
        id: 'account-register',
        title: 'Account register',
        subtitle: periodLabel(query.from, query.to),
        columns,
        currency,
        sections: [],
        empty: true,
        notes: ['That account no longer exists.'],
      }
    }

    return {
      id: 'account-register',
      title: `${register.account.accountNumber ? `${register.account.accountNumber} · ` : ''}${register.account.name}`,
      subtitle: periodLabel(query.from, query.to),
      columns,
      currency,
      empty: register.entries.length === 0,
      highlights: [
        { label: 'Opening balance', value: register.opening.toFixed(2), tone: 'muted' },
        { label: 'Period movement', value: register.periodNet.toFixed(2) },
        { label: 'Closing balance', value: register.closing.toFixed(2) },
      ],
      sections: [
        {
          key: 'register',
          rows: [
            row('opening', columns, {
              description: text('Opening balance'),
              balance: money2(register.opening),
            }),
            ...register.entries.map((entry) => {
              const href = sourceHref(entry.sourceType, entry.sourceId)
              return {
                key: `line-${entry.lineId}`,
                ...(href ? { href } : {}),
                cells: {
                  date: day(entry.date),
                  source: text(entry.sourceType.replace(/_/g, ' ')),
                  reference: text(entry.reference || '—'),
                  description: text(entry.description || '—'),
                  debit: entry.debit.isZero() ? blank : money2(entry.debit),
                  credit: entry.credit.isZero() ? blank : money2(entry.credit),
                  balance: money2(entry.balance),
                } as Record<string, Cell>,
              }
            }),
          ],
          footer: {
            key: 'closing',
            emphasis: 'total',
            cells: {
              date: blank,
              source: blank,
              reference: blank,
              description: text('Closing balance'),
              debit: money2(register.periodDebit),
              credit: money2(register.periodCredit),
              balance: money2(register.closing),
            },
          },
        },
      ],
      notes: register.truncated
        ? [`Showing the first ${register.entries.length} lines. Narrow the date range to see the rest.`]
        : undefined,
    }
  },
}

const salesByCustomerReport: ReportDefinition = {
  id: 'sales-by-customer',
  title: 'Sales by customer',
  description: 'Who bought what, what they paid and what they still owe.',
  family: 'sales',
  controls: ['range', 'dimensions'],
  build: async ({ db, query, currency, terms }) => {
    const report = await salesByCustomer(db, {
      from: query.from,
      to: query.to,
      classId: query.classId,
      jobId: query.jobId,
    })
    const columns: ReportColumn[] = [
      { key: 'name', label: terms.customer },
      { key: 'invoices', label: `${terms.invoice}s`, numeric: true, optional: true },
      { key: 'sales', label: 'Sales', numeric: true },
      { key: 'paid', label: 'Paid', numeric: true },
      { key: 'balance', label: 'Open balance', numeric: true },
      { key: 'share', label: 'Share', numeric: true, optional: true },
    ]

    return {
      id: 'sales-by-customer',
      title: `Sales by ${terms.customer.toLowerCase()}`,
      subtitle: periodLabel(query.from, query.to),
      columns,
      currency,
      empty: report.rows.length === 0,
      sections: [
        {
          key: 'rows',
          rows: report.rows.map((line) => ({
            key: `c-${line.customerId}`,
            href: `/customers/${line.customerId}`,
            cells: {
              name: text(line.name),
              invoices: count(line.invoices),
              sales: money2(line.sales),
              paid: money2(line.paid),
              balance: money2(line.balance),
              share: percent(line.share),
            },
          })),
          footer: {
            key: 'total',
            emphasis: 'total',
            cells: {
              name: text('Totals'),
              invoices: count(report.invoiceCount),
              sales: money2(report.totalSales),
              paid: money2(report.totalPaid),
              balance: money2(report.totalBalance),
              share: percent(report.totalSales.isZero() ? ZERO : new Decimal(100)),
            },
          },
        },
      ],
    }
  },
}

const salesByItemReport: ReportDefinition = {
  id: 'sales-by-item',
  title: 'Sales by item',
  description: 'Quantity, revenue and margin for every product and service sold.',
  family: 'sales',
  controls: ['range'],
  build: async ({ db, query, currency }) => {
    const report = await salesByItem(db, { from: query.from, to: query.to })
    const columns: ReportColumn[] = [
      { key: 'name', label: 'Item' },
      { key: 'type', label: 'Type', optional: true },
      { key: 'quantity', label: 'Quantity', numeric: true },
      { key: 'sales', label: 'Revenue', numeric: true },
      { key: 'cost', label: 'Cost', numeric: true, optional: true },
      { key: 'margin', label: 'Margin', numeric: true },
      { key: 'marginPercent', label: 'Margin %', numeric: true, optional: true },
    ]

    return {
      id: 'sales-by-item',
      title: 'Sales by item',
      subtitle: periodLabel(query.from, query.to),
      columns,
      currency,
      empty: report.rows.length === 0,
      sections: [
        {
          key: 'rows',
          rows: report.rows.map((line) => ({
            key: `i-${line.itemId ?? 'none'}`,
            ...(line.itemId ? { href: `/items/${line.itemId}` } : {}),
            cells: {
              name: text(line.name),
              type: text(String(line.itemType).toLowerCase()),
              quantity: count(line.quantity, 2),
              sales: money2(line.sales),
              cost: money2(line.cost),
              margin: money2(line.margin),
              marginPercent: percent(line.marginPercent),
            },
          })),
          footer: {
            key: 'total',
            emphasis: 'total',
            cells: {
              name: text('Totals'),
              type: blank,
              quantity: count(report.totalQuantity, 2),
              sales: money2(report.totalSales),
              cost: money2(report.totalCost),
              margin: money2(report.totalMargin),
              marginPercent: report.totalSales.isZero()
                ? blank
                : percent(report.totalMargin.dividedBy(report.totalSales).times(100)),
            },
          },
        },
      ],
    }
  },
}

const openInvoicesReport: ReportDefinition = {
  id: 'open-invoices',
  title: 'Open invoices',
  description: 'Everything unpaid as of a date, oldest due first.',
  family: 'sales',
  controls: ['asOf', 'customer'],
  build: async ({ db, query, currency, terms }) => {
    const report = await openInvoices(db, { asOf: query.asOf, customerId: query.customerId })
    const columns: ReportColumn[] = [
      { key: 'number', label: 'Number', width: '8rem' },
      { key: 'customer', label: terms.customer },
      { key: 'date', label: 'Date', optional: true },
      { key: 'due', label: 'Due' },
      { key: 'overdue', label: 'Days overdue', numeric: true },
      { key: 'total', label: 'Total', numeric: true, optional: true },
      { key: 'balance', label: 'Balance', numeric: true },
    ]

    return {
      id: 'open-invoices',
      title: `Open ${terms.invoice.toLowerCase()}s`,
      subtitle: asOfLabel(query.asOf),
      columns,
      currency,
      empty: report.rows.length === 0,
      highlights: [
        { label: 'Open balance', value: report.totalBalance.toFixed(2) },
        {
          label: `Overdue (${report.overdueCount})`,
          value: report.overdueBalance.toFixed(2),
          tone: report.overdueBalance.isZero() ? 'muted' : 'negative',
        },
      ],
      sections: [
        {
          key: 'rows',
          rows: report.rows.map((line) => ({
            key: `inv-${line.invoiceId}`,
            href: `/invoices/${line.invoiceId}`,
            cells: {
              number: text(line.invoiceNumber),
              customer: text(line.customerName),
              date: day(line.date),
              due: line.dueDate ? day(line.dueDate) : text('On receipt'),
              overdue: line.daysOverdue > 0 ? count(line.daysOverdue) : text('Not yet due', { muted: true }),
              total: money2(line.total),
              balance: money2(line.balance),
            },
          })),
          footer: {
            key: 'total',
            emphasis: 'total',
            cells: {
              number: blank,
              customer: text('Totals'),
              date: blank,
              due: blank,
              overdue: blank,
              total: blank,
              balance: money2(report.totalBalance),
            },
          },
        },
      ],
    }
  },
}

const arAgingReport: ReportDefinition = {
  id: 'ar-aging',
  title: 'A/R aging summary',
  description: 'Open receivables by customer and how late they are.',
  family: 'sales',
  controls: ['asOf'],
  build: async ({ db, query, currency, terms }) => {
    const report = await arAging(db, query.asOf)
    const columns: ReportColumn[] = [
      { key: 'name', label: terms.customer },
      ...report.buckets.map((bucket) => ({
        key: bucket,
        label: bucket === 'Current' ? 'Not yet due' : `${bucket} days`,
        numeric: true,
      })),
      { key: 'total', label: 'Total', numeric: true },
    ]

    return {
      id: 'ar-aging',
      title: `${terms.customer} aging summary`,
      subtitle: asOfLabel(query.asOf),
      columns,
      currency,
      empty: report.rows.length === 0,
      sections: [
        {
          key: 'rows',
          rows: report.rows.map((line) => ({
            key: `ar-${line.customerId}`,
            href: `/reports/open-invoices?customer=${line.customerId}&asOf=${isoDate(query.asOf)}`,
            cells: {
              name: text(line.name),
              ...Object.fromEntries(report.buckets.map((bucket) => [bucket, money2(line.buckets[bucket])])),
              total: money2(line.total),
            },
          })),
          footer: {
            key: 'total',
            emphasis: 'total',
            cells: {
              name: text('Totals'),
              ...Object.fromEntries(report.buckets.map((bucket) => [bucket, money2(report.totals[bucket])])),
              total: money2(report.grandTotal),
            },
          },
        },
      ],
    }
  },
}

const arDetailReport: ReportDefinition = {
  id: 'ar-detail',
  title: 'A/R aging detail',
  description: 'Every open invoice, aged and grouped by customer.',
  family: 'sales',
  controls: ['asOf', 'customer'],
  build: async ({ db, query, currency, terms }) => {
    const report = await arDetail(db, { asOf: query.asOf, customerId: query.customerId })
    const columns: ReportColumn[] = [
      { key: 'number', label: 'Number', width: '8rem' },
      { key: 'date', label: 'Date', optional: true },
      { key: 'due', label: 'Due' },
      { key: 'bucket', label: 'Age' },
      { key: 'total', label: 'Total', numeric: true, optional: true },
      { key: 'balance', label: 'Balance', numeric: true },
    ]

    return {
      id: 'ar-detail',
      title: `${terms.customer} aging detail`,
      subtitle: asOfLabel(query.asOf),
      columns,
      currency,
      empty: report.rows.length === 0,
      sections: [
        ...report.groups.map((group) => ({
          key: `g-${group.customerId}`,
          title: group.name,
          rows: group.rows.map((line) => ({
            key: `d-${line.invoiceId}`,
            href: `/invoices/${line.invoiceId}`,
            cells: {
              number: text(line.invoiceNumber),
              date: day(line.date),
              due: line.dueDate ? day(line.dueDate) : text('On receipt'),
              bucket: text(line.bucket === 'Current' ? 'Not yet due' : `${line.bucket} days`),
              total: money2(line.total),
              balance: money2(line.balance),
            },
          })),
          footer: {
            key: `g-${group.customerId}-total`,
            emphasis: 'subtotal' as const,
            cells: {
              number: blank,
              date: blank,
              due: blank,
              bucket: blank,
              total: blank,
              balance: money2(group.total),
            },
          },
        })),
        {
          key: 'grand',
          rows: [
            {
              key: 'grand-total',
              emphasis: 'total' as const,
              cells: {
                number: blank,
                date: blank,
                due: blank,
                bucket: text('Total open'),
                total: blank,
                balance: money2(report.grandTotal),
              },
            },
          ],
        },
      ],
    }
  },
}

const customerStatementReport: ReportDefinition = {
  id: 'customer-statement',
  title: 'Customer statement',
  description: 'One customer: opening balance, activity and what is outstanding.',
  family: 'sales',
  controls: ['range', 'customer'],
  build: async ({ db, query, currency, terms }) => {
    const columns: ReportColumn[] = [
      { key: 'date', label: 'Date', width: '7rem' },
      { key: 'type', label: 'Type' },
      { key: 'reference', label: 'Reference' },
      { key: 'charge', label: 'Charge', numeric: true },
      { key: 'credit', label: 'Payment or credit', numeric: true },
      { key: 'balance', label: 'Balance', numeric: true },
    ]

    if (query.customerId == null) {
      return {
        id: 'customer-statement',
        title: `${terms.customer} statement`,
        subtitle: periodLabel(query.from, query.to),
        columns,
        currency,
        sections: [],
        empty: true,
        notes: [`Choose a ${terms.customer.toLowerCase()} to build a statement.`],
      }
    }

    const statement = await customerStatement(db, {
      customerId: query.customerId,
      from: query.from,
      to: query.to,
    })
    if (!statement) {
      return {
        id: 'customer-statement',
        title: `${terms.customer} statement`,
        subtitle: periodLabel(query.from, query.to),
        columns,
        currency,
        sections: [],
        empty: true,
        notes: [`That ${terms.customer.toLowerCase()} no longer exists.`],
      }
    }

    const href = (entry: { kind: string; documentId: number }) =>
      entry.kind === 'invoice'
        ? `/invoices/${entry.documentId}`
        : entry.kind === 'payment'
          ? `/payments/${entry.documentId}`
          : `/credit-memos/${entry.documentId}`

    return {
      id: 'customer-statement',
      title: `${statement.customer.name} — statement`,
      subtitle: periodLabel(query.from, query.to),
      columns,
      currency,
      empty: statement.entries.length === 0,
      highlights: [
        { label: 'Opening balance', value: statement.opening.toFixed(2), tone: 'muted' },
        { label: 'Charges', value: statement.totalCharges.toFixed(2) },
        { label: 'Payments and credits', value: statement.totalCredits.toFixed(2) },
        { label: 'Closing balance', value: statement.closing.toFixed(2) },
      ],
      sections: [
        {
          key: 'activity',
          rows: [
            row('opening', columns, {
              type: text('Opening balance'),
              balance: money2(statement.opening),
            }),
            ...statement.entries.map((entry) => ({
              key: `${entry.kind}-${entry.documentId}`,
              href: href(entry),
              cells: {
                date: day(entry.date),
                type: text(entry.kind === 'credit' ? 'Credit memo' : entry.kind === 'invoice' ? terms.invoice : 'Payment'),
                reference: text(entry.reference),
                charge: entry.charge.isZero() ? blank : money2(entry.charge),
                credit: entry.credit.isZero() ? blank : money2(entry.credit),
                balance: money2(entry.balance),
              } as Record<string, Cell>,
            })),
          ],
          footer: {
            key: 'closing',
            emphasis: 'total',
            cells: {
              date: blank,
              type: text('Balance due'),
              reference: blank,
              charge: money2(statement.totalCharges),
              credit: money2(statement.totalCredits),
              balance: money2(statement.closing),
            },
          },
        },
        {
          key: 'aging',
          title: 'Aging of the open balance',
          rows: [
            row('aging-row', columns, {
              type: text('Not yet due'),
              balance: money2(statement.aging.current),
            }),
            row('aging-30', columns, { type: text('1–30 days'), balance: money2(statement.aging.over30) }),
            row('aging-60', columns, { type: text('31–60 days'), balance: money2(statement.aging.over60) }),
            row('aging-90', columns, { type: text('Over 60 days'), balance: money2(statement.aging.over90) }),
          ],
        },
      ],
    }
  },
}

const expensesByVendorReport: ReportDefinition = {
  id: 'expenses-by-vendor',
  title: 'Expenses by vendor',
  description: 'What each vendor billed, what has been paid and what is outstanding.',
  family: 'purchases',
  controls: ['range', 'vendor'],
  build: async ({ db, query, currency }) => {
    const report = await expensesByVendor(db, { from: query.from, to: query.to })
    const columns: ReportColumn[] = [
      { key: 'name', label: 'Vendor' },
      { key: 'bills', label: 'Bills', numeric: true, optional: true },
      { key: 'billed', label: 'Billed', numeric: true },
      { key: 'paid', label: 'Paid', numeric: true },
      { key: 'balance', label: 'Open balance', numeric: true },
      { key: 'share', label: 'Share', numeric: true, optional: true },
    ]

    return {
      id: 'expenses-by-vendor',
      title: 'Expenses by vendor',
      subtitle: periodLabel(query.from, query.to),
      columns,
      currency,
      empty: report.rows.length === 0,
      notes: report.rows.length === 0 ? [PURCHASING_PENDING_NOTE] : undefined,
      sections: [
        {
          key: 'rows',
          rows: report.rows.map((line) => ({
            key: `v-${line.vendorId}`,
            href: `/vendors/${line.vendorId}`,
            cells: {
              name: text(line.name),
              bills: count(line.bills),
              billed: money2(line.billed),
              paid: money2(line.paid),
              balance: money2(line.balance),
              share: percent(line.share),
            },
          })),
          footer: {
            key: 'total',
            emphasis: 'total',
            cells: {
              name: text('Totals'),
              bills: blank,
              billed: money2(report.totalBilled),
              paid: money2(report.totalPaid),
              balance: money2(report.totalBalance),
              share: blank,
            },
          },
        },
      ],
    }
  },
}

const expensesByCategoryReport: ReportDefinition = {
  id: 'expenses-by-category',
  title: 'Expenses by category',
  description: 'Spending by expense account, from the ledger — bills, cards and cash together.',
  family: 'purchases',
  controls: ['range', 'dimensions'],
  build: async ({ db, query, currency }) => {
    const report = await expensesByCategory(db, { from: query.from, to: query.to })
    const columns: ReportColumn[] = [
      { key: 'number', label: 'Number', width: '7rem', optional: true },
      { key: 'name', label: 'Category' },
      { key: 'amount', label: 'Amount', numeric: true },
      { key: 'share', label: 'Share', numeric: true },
    ]

    return {
      id: 'expenses-by-category',
      title: 'Expenses by category',
      subtitle: periodLabel(query.from, query.to),
      columns,
      currency,
      empty: report.rows.length === 0,
      sections: [
        {
          key: 'rows',
          rows: report.rows.map((line) => ({
            key: `cat-${line.accountId}`,
            ...(line.accountId ? { href: registerHref(line.accountId, query.from, query.to, query) } : {}),
            cells: {
              number: text(line.accountNumber || '—'),
              name: text(line.name),
              amount: money2(line.amount),
              share: percent(line.share),
            },
          })),
          footer: {
            key: 'total',
            emphasis: 'total',
            cells: {
              number: blank,
              name: text('Total spending'),
              amount: money2(report.total),
              share: blank,
            },
          },
        },
      ],
    }
  },
}

const openBillsReport: ReportDefinition = {
  id: 'open-bills',
  title: 'Open bills',
  description: 'Unpaid bills as of a date, oldest due first.',
  family: 'purchases',
  controls: ['asOf', 'vendor'],
  build: async ({ db, query, currency }) => {
    const report = await openBills(db, { asOf: query.asOf, vendorId: query.vendorId })
    const columns: ReportColumn[] = [
      { key: 'number', label: 'Bill', width: '9rem' },
      { key: 'vendor', label: 'Vendor' },
      { key: 'date', label: 'Date', optional: true },
      { key: 'due', label: 'Due' },
      { key: 'overdue', label: 'Days overdue', numeric: true },
      { key: 'balance', label: 'Balance', numeric: true },
    ]

    return {
      id: 'open-bills',
      title: 'Open bills',
      subtitle: asOfLabel(query.asOf),
      columns,
      currency,
      empty: report.rows.length === 0,
      notes: report.rows.length === 0 ? [PURCHASING_PENDING_NOTE] : undefined,
      highlights: [
        { label: 'Open balance', value: report.totalBalance.toFixed(2) },
        {
          label: `Overdue (${report.overdueCount})`,
          value: report.overdueBalance.toFixed(2),
          tone: report.overdueBalance.isZero() ? 'muted' : 'negative',
        },
      ],
      sections: [
        {
          key: 'rows',
          rows: report.rows.map((line) => ({
            key: `bill-${line.billId}`,
            href: `/bills/${line.billId}`,
            cells: {
              number: text(line.billNumber),
              vendor: text(line.vendorName),
              date: day(line.date),
              due: line.dueDate ? day(line.dueDate) : text('On receipt'),
              overdue: line.daysOverdue > 0 ? count(line.daysOverdue) : text('Not yet due', { muted: true }),
              balance: money2(line.balance),
            },
          })),
          footer: {
            key: 'total',
            emphasis: 'total',
            cells: {
              number: blank,
              vendor: text('Totals'),
              date: blank,
              due: blank,
              overdue: blank,
              balance: money2(report.totalBalance),
            },
          },
        },
      ],
    }
  },
}

const apAgingReport: ReportDefinition = {
  id: 'ap-aging',
  title: 'A/P aging summary',
  description: 'What is owed to each vendor and how late it is.',
  family: 'purchases',
  controls: ['asOf'],
  build: async ({ db, query, currency }) => {
    const report = await apAging(db, query.asOf)
    const columns: ReportColumn[] = [
      { key: 'name', label: 'Vendor' },
      ...report.buckets.map((bucket) => ({
        key: bucket,
        label: bucket === 'Current' ? 'Not yet due' : `${bucket} days`,
        numeric: true,
      })),
      { key: 'total', label: 'Total', numeric: true },
    ]

    return {
      id: 'ap-aging',
      title: 'Vendor aging summary',
      subtitle: asOfLabel(query.asOf),
      columns,
      currency,
      empty: report.rows.length === 0,
      notes: report.rows.length === 0 ? [PURCHASING_PENDING_NOTE] : undefined,
      sections: [
        {
          key: 'rows',
          rows: report.rows.map((line) => ({
            key: `ap-${line.vendorId}`,
            href: `/reports/open-bills?vendor=${line.vendorId}&asOf=${isoDate(query.asOf)}`,
            cells: {
              name: text(line.name),
              ...Object.fromEntries(report.buckets.map((bucket) => [bucket, money2(line.buckets[bucket])])),
              total: money2(line.total),
            },
          })),
          footer: {
            key: 'total',
            emphasis: 'total',
            cells: {
              name: text('Totals'),
              ...Object.fromEntries(report.buckets.map((bucket) => [bucket, money2(report.totals[bucket])])),
              total: money2(report.grandTotal),
            },
          },
        },
      ],
    }
  },
}

const apDetailReport: ReportDefinition = {
  id: 'ap-detail',
  title: 'A/P aging detail',
  description: 'Every open bill, aged and grouped by vendor.',
  family: 'purchases',
  controls: ['asOf', 'vendor'],
  build: async ({ db, query, currency }) => {
    const report = await apDetail(db, { asOf: query.asOf, vendorId: query.vendorId })
    const columns: ReportColumn[] = [
      { key: 'number', label: 'Bill', width: '9rem' },
      { key: 'date', label: 'Date', optional: true },
      { key: 'due', label: 'Due' },
      { key: 'bucket', label: 'Age' },
      { key: 'balance', label: 'Balance', numeric: true },
    ]

    return {
      id: 'ap-detail',
      title: 'Vendor aging detail',
      subtitle: asOfLabel(query.asOf),
      columns,
      currency,
      empty: report.rows.length === 0,
      notes: report.rows.length === 0 ? [PURCHASING_PENDING_NOTE] : undefined,
      sections: [
        ...report.groups.map((group) => ({
          key: `g-${group.vendorId}`,
          title: group.name,
          rows: group.rows.map((line) => ({
            key: `b-${line.billId}`,
            href: `/bills/${line.billId}`,
            cells: {
              number: text(line.billNumber),
              date: day(line.date),
              due: line.dueDate ? day(line.dueDate) : text('On receipt'),
              bucket: text(line.bucket === 'Current' ? 'Not yet due' : `${line.bucket} days`),
              balance: money2(line.balance),
            },
          })),
          footer: {
            key: `g-${group.vendorId}-total`,
            emphasis: 'subtotal' as const,
            cells: {
              number: blank,
              date: blank,
              due: blank,
              bucket: blank,
              balance: money2(group.total),
            },
          },
        })),
        {
          key: 'grand',
          rows: [
            {
              key: 'grand-total',
              emphasis: 'total' as const,
              cells: {
                number: blank,
                date: blank,
                due: blank,
                bucket: text('Total open'),
                balance: money2(report.grandTotal),
              },
            },
          ],
        },
      ],
    }
  },
}

const summary1099Report: ReportDefinition = {
  id: '1099-summary',
  title: '1099 summary',
  description: 'Cash paid to 1099 vendors for a calendar year, against the $600 threshold.',
  family: 'purchases',
  controls: ['year'],
  build: async ({ db, query, currency }) => {
    const report = await summary1099(db, { year: query.year })
    const columns: ReportColumn[] = [
      { key: 'name', label: 'Vendor' },
      { key: 'taxId', label: 'Tax ID' },
      { key: 'box', label: 'Form', optional: true },
      { key: 'w9', label: 'W-9' },
      { key: 'paid', label: 'Paid in year', numeric: true },
      { key: 'reportable', label: 'Reportable' },
    ]

    return {
      id: '1099-summary',
      title: `1099 summary for ${report.year}`,
      subtitle: `1 January ${report.year} – 31 December ${report.year}`,
      columns,
      currency,
      empty: report.rows.length === 0,
      notes: [
        ...(report.rows.length === 0 ? [PURCHASING_PENDING_NOTE] : []),
        ...(report.missingTaxId > 0
          ? [`${report.missingTaxId} reportable vendors have no tax ID on file. Collect a W-9 before filing.`]
          : []),
      ],
      highlights: [
        { label: 'Reportable vendors', value: String(report.reportable) },
        { label: 'Total paid', value: report.total.toFixed(2) },
      ],
      sections: [
        {
          key: 'rows',
          rows: report.rows.map((line) => ({
            key: `v-${line.vendorId}`,
            href: `/vendors/${line.vendorId}`,
            cells: {
              name: text(line.name),
              taxId: line.taxId ? text(line.taxId) : text('Missing', { muted: true }),
              box: text(`1099-${line.boxType}`),
              w9: text(line.w9OnFile ? 'On file' : 'Not on file'),
              paid: money2(line.totalPaid),
              reportable: text(line.aboveThreshold ? 'Yes — over threshold' : 'No — under threshold'),
            },
          })),
          footer: {
            key: 'total',
            emphasis: 'total',
            cells: {
              name: text('Totals'),
              taxId: blank,
              box: blank,
              w9: blank,
              paid: money2(report.total),
              reportable: text(`${report.reportable} reportable`),
            },
          },
        },
      ],
    }
  },
}

const valuationReport: ReportDefinition = {
  id: 'inventory-valuation',
  title: 'Inventory valuation',
  description: 'Quantity on hand times average cost, checked against the inventory asset account.',
  family: 'inventory',
  controls: ['asOf'],
  build: async ({ db, query, currency }) => {
    const report = await inventoryValuation(db, { asOf: query.asOf })
    const columns: ReportColumn[] = [
      { key: 'name', label: 'Item' },
      { key: 'quantity', label: 'On hand', numeric: true },
      { key: 'avgCost', label: 'Average cost', numeric: true },
      { key: 'value', label: 'Value', numeric: true },
      { key: 'share', label: 'Share', numeric: true, optional: true },
    ]

    return {
      id: 'inventory-valuation',
      title: 'Inventory valuation',
      subtitle: asOfLabel(query.asOf),
      columns,
      currency,
      empty: report.rows.length === 0,
      highlights: [
        { label: 'Inventory value', value: report.total.toFixed(2) },
        { label: 'Inventory asset account', value: report.ledgerValue.toFixed(2), tone: 'muted' },
      ],
      notes: report.variance.isZero()
        ? undefined
        : [`Item valuation and the inventory asset account differ by ${report.variance.toFixed(2)}. An adjustment posted without a movement, or the other way round.`],
      sections: [
        {
          key: 'rows',
          rows: report.rows.map((line) => ({
            key: `it-${line.itemId}`,
            href: `/items/${line.itemId}`,
            cells: {
              name: text(line.name),
              quantity: count(line.quantity, 2),
              avgCost: money2(line.avgCost),
              value: money2(line.value),
              share: percent(line.share),
            },
          })),
          footer: {
            key: 'total',
            emphasis: 'total',
            cells: {
              name: text('Total on hand'),
              quantity: blank,
              avgCost: blank,
              value: money2(report.total),
              share: blank,
            },
          },
        },
      ],
    }
  },
}

const stockStatusReport: ReportDefinition = {
  id: 'stock-status',
  title: 'Stock status',
  description: 'What has run out, what is below its reorder point and what has gone negative.',
  family: 'inventory',
  controls: ['asOf'],
  build: async ({ db, query, currency }) => {
    const report = await stockStatus(db, { asOf: query.asOf })
    const columns: ReportColumn[] = [
      { key: 'name', label: 'Item' },
      { key: 'state', label: 'Status' },
      { key: 'quantity', label: 'On hand', numeric: true },
      { key: 'reorder', label: 'Reorder point', numeric: true },
      { key: 'shortfall', label: 'Short by', numeric: true },
      { key: 'sold', label: 'Sold, last 90 days', numeric: true, optional: true },
    ]

    const label: Record<string, string> = {
      ok: 'In stock',
      reorder: 'Reorder',
      out: 'Out of stock',
      negative: 'Negative — check postings',
    }

    return {
      id: 'stock-status',
      title: 'Stock status',
      subtitle: asOfLabel(query.asOf),
      columns,
      currency,
      empty: report.rows.length === 0,
      highlights: [
        { label: 'Items needing attention', value: String(report.needsAttention), tone: report.needsAttention ? 'negative' : 'muted' },
        { label: 'Value on hand', value: report.onHandValue.toFixed(2) },
      ],
      sections: [
        {
          key: 'rows',
          rows: report.rows.map((line) => ({
            key: `st-${line.itemId}`,
            href: `/items/${line.itemId}`,
            cells: {
              name: text(line.name),
              state: text(label[line.state]),
              quantity: count(line.quantity, 2),
              reorder: count(line.reorderPoint, 2),
              shortfall: line.shortfall.isZero() ? blank : count(line.shortfall, 2),
              sold: count(line.soldLast90, 2),
            },
          })),
        },
      ],
    }
  },
}

const cogsReport: ReportDefinition = {
  id: 'cogs-by-item',
  title: 'Cost of goods sold by item',
  description: 'What each item actually cost to sell, and the margin that left.',
  family: 'inventory',
  controls: ['range'],
  build: async ({ db, query, currency }) => {
    const report = await cogsByItem(db, { from: query.from, to: query.to })
    const columns: ReportColumn[] = [
      { key: 'name', label: 'Item' },
      { key: 'quantity', label: 'Quantity sold', numeric: true },
      { key: 'revenue', label: 'Revenue', numeric: true },
      { key: 'cogs', label: 'Cost of goods sold', numeric: true },
      { key: 'margin', label: 'Margin', numeric: true },
      { key: 'marginPercent', label: 'Margin %', numeric: true, optional: true },
    ]

    return {
      id: 'cogs-by-item',
      title: 'Cost of goods sold by item',
      subtitle: periodLabel(query.from, query.to),
      columns,
      currency,
      empty: report.rows.length === 0,
      sections: [
        {
          key: 'rows',
          rows: report.rows.map((line) => ({
            key: `cg-${line.itemId}`,
            href: `/items/${line.itemId}`,
            cells: {
              name: text(line.name),
              quantity: count(line.quantitySold, 2),
              revenue: money2(line.revenue),
              cogs: money2(line.cogs),
              margin: money2(line.margin),
              marginPercent: percent(line.marginPercent),
            },
          })),
          footer: {
            key: 'total',
            emphasis: 'total',
            cells: {
              name: text('Totals'),
              quantity: blank,
              revenue: money2(report.totalRevenue),
              cogs: money2(report.totalCogs),
              margin: money2(report.totalMargin),
              marginPercent: report.totalRevenue.isZero()
                ? blank
                : percent(report.totalMargin.dividedBy(report.totalRevenue).times(100)),
            },
          },
        },
      ],
    }
  },
}

export const REPORTS: ReportDefinition[] = [
  profitAndLoss,
  balanceSheet,
  cashFlow,
  trialBalance,
  generalLedgerReport,
  registerReport,
  salesByCustomerReport,
  salesByItemReport,
  openInvoicesReport,
  arAgingReport,
  arDetailReport,
  customerStatementReport,
  expensesByVendorReport,
  expensesByCategoryReport,
  openBillsReport,
  apAgingReport,
  apDetailReport,
  summary1099Report,
  valuationReport,
  stockStatusReport,
  cogsReport,
]

const BY_ID = new Map(REPORTS.map((report) => [report.id, report]))

export const getReport = (id: string) => BY_ID.get(id) ?? null

export const reportsByFamily = (family: ReportFamily) =>
  REPORTS.filter((report) => report.family === family)
