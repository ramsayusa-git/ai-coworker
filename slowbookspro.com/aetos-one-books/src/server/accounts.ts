import 'server-only'
import { Decimal } from 'decimal.js'
import { money, ZERO } from '@/lib/money'
import type { TenantClient } from '@/lib/tenant-db'
import { ForbiddenError } from '@/lib/rbac'
import type { Account, AccountType, Prisma } from '@/generated/tenant/client'
import { CONTROL_ACCOUNTS } from './seed-tenant'
import { ClosedPeriodError, NORMAL_BALANCE, UnbalancedEntryError } from './ledger'

/**
 * Chart of accounts: the shape of the ledger, and the guards that keep it
 * postable.
 *
 * Three rules do the work here:
 *   1. A control account is found by its NUMBER by every posting routine, so
 *      its number and type are frozen. Renaming stays free.
 *   2. An account with posted lines is never deleted — deactivate it instead,
 *      so history keeps its account name.
 *   3. `bank_kind` and `account_type` must agree: a bank is an asset, a card
 *      is a liability. Everything downstream (register, feeds, reconcile,
 *      transfers, every "paid from" picker) keys off `bank_kind`.
 */

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}

/** Why each structural account exists, in the words the user sees. */
export const CONTROL_PURPOSE: Record<string, string> = {
  [CONTROL_ACCOUNTS.CHECKING]: 'the default bank account for deposits and payments',
  [CONTROL_ACCOUNTS.UNDEPOSITED_FUNDS]: 'payments received but not yet deposited',
  [CONTROL_ACCOUNTS.ACCOUNTS_RECEIVABLE]: 'what customers owe — every invoice and payment',
  [CONTROL_ACCOUNTS.INVENTORY]: 'the inventory asset behind item purchases and sales',
  [CONTROL_ACCOUNTS.FIXED_ASSETS]: 'the cost of assets you depreciate',
  [CONTROL_ACCOUNTS.ACCUM_DEPRECIATION]: 'depreciation taken against fixed assets',
  [CONTROL_ACCOUNTS.ACCOUNTS_PAYABLE]: 'what you owe vendors — every bill and bill payment',
  [CONTROL_ACCOUNTS.CREDIT_CARD]: 'credit-card charges and the card balance',
  [CONTROL_ACCOUNTS.SALES_TAX_PAYABLE]: 'sales tax collected on invoices and receipts',
  [CONTROL_ACCOUNTS.PAYROLL_LIABILITIES]: 'payroll taxes and withholdings you still owe',
  [CONTROL_ACCOUNTS.OPENING_BALANCE_EQUITY]: 'the balancing side of opening balances',
  [CONTROL_ACCOUNTS.RETAINED_EARNINGS]: 'prior-year profit carried forward',
  [CONTROL_ACCOUNTS.UNRESTRICTED_NET_ASSETS]: 'net assets without donor restrictions',
  [CONTROL_ACCOUNTS.SALES]: 'the default income account for sales',
  [CONTROL_ACCOUNTS.SERVICE_INCOME]: 'the default income account for invoice lines',
  [CONTROL_ACCOUNTS.DISCOUNTS]: 'discounts given on invoices',
  [CONTROL_ACCOUNTS.LATE_FEES]: 'finance charges added to overdue invoices',
  [CONTROL_ACCOUNTS.COGS]: 'the cost side of an inventory item sale',
  [CONTROL_ACCOUNTS.INVENTORY_ADJUSTMENT]: 'write-offs and quantity corrections',
  [CONTROL_ACCOUNTS.PAYROLL_WAGES]: 'gross wages posted by a pay run',
  [CONTROL_ACCOUNTS.PAYROLL_TAXES]: 'employer taxes posted by a pay run',
  [CONTROL_ACCOUNTS.PAYROLL_BENEFITS]: 'benefit costs posted by a pay run',
  [CONTROL_ACCOUNTS.BAD_DEBT]: 'invoices written off as uncollectable',
  [CONTROL_ACCOUNTS.UNCATEGORIZED_EXPENSE]: 'where an uncategorised bank line lands',
  [CONTROL_ACCOUNTS.FX_GAIN_LOSS]: 'the realised difference when a foreign balance settles',
}

export const isControlNumber = (n: string | null | undefined): boolean =>
  !!n && Object.prototype.hasOwnProperty.call(CONTROL_PURPOSE, n)

export const controlPurpose = (n: string | null | undefined): string | null =>
  n && isControlNumber(n) ? CONTROL_PURPOSE[n]! : null

/** `bank` must be an asset, `credit_card` must be a liability, null is free. */
export const BANK_KINDS = ['bank', 'credit_card'] as const
export type BankKind = (typeof BANK_KINDS)[number]

const REQUIRED_TYPE: Record<BankKind, AccountType> = {
  bank: 'ASSET',
  credit_card: 'LIABILITY',
}

export function assertBankKind(kind: string | null | undefined, type: AccountType) {
  if (!kind) return
  const want = REQUIRED_TYPE[kind as BankKind]
  if (!want) throw new DomainError(`"${kind}" is not a bank kind. Use bank or credit_card.`)
  if (want !== type) {
    throw new DomainError(
      `A ${kind === 'bank' ? 'bank' : 'credit card'} account must be ${want === 'ASSET' ? 'an asset' : 'a liability'}, not ${type.toLowerCase()}.`,
    )
  }
}

export const isDebitNormal = (type: AccountType) => NORMAL_BALANCE[type] === 'DEBIT'

/**
 * Derived GL balances — one grouped query, natural-signed per account. This is
 * authoritative everywhere; the cached `accounts.balance` column is only ever a
 * hint for the chart list.
 */
export async function glBalances(
  db: TenantClient,
  accountIds: number[],
  opts: { asOf?: Date } = {},
): Promise<Map<number, Decimal>> {
  const result = new Map<number, Decimal>(accountIds.map((id) => [id, ZERO]))
  if (accountIds.length === 0) return result

  const [grouped, accounts] = await Promise.all([
    db.transactionLine.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: accountIds },
        transaction: { isVoided: false, ...(opts.asOf ? { date: { lte: opts.asOf } } : {}) },
      },
      _sum: { debit: true, credit: true },
    }),
    db.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, accountType: true },
    }),
  ])

  const typeById = new Map(accounts.map((a) => [a.id, a.accountType]))
  for (const row of grouped) {
    const dr = money(row._sum.debit?.toString() ?? 0)
    const cr = money(row._sum.credit?.toString() ?? 0)
    const type = typeById.get(row.accountId)
    const debitNormal = type ? isDebitNormal(type) : true
    result.set(row.accountId, debitNormal ? dr.minus(cr) : cr.minus(dr))
  }
  return result
}

export async function glBalance(db: TenantClient, accountId: number, opts: { asOf?: Date } = {}) {
  return (await glBalances(db, [accountId], opts)).get(accountId) ?? ZERO
}

export type AccountRow = Account & {
  isControl: boolean
  controlPurpose: string | null
  /** Natural-signed balance of this account alone. */
  balance: Decimal
  /** This account plus every descendant — what a collapsed parent shows. */
  rollup: Decimal
  lineCount: number
  depth: number
}

export type AccountNode = AccountRow & { children: AccountNode[] }

export async function listAccounts(
  db: TenantClient,
  opts: { activeOnly?: boolean; accountType?: AccountType; bankOnly?: boolean } = {},
) {
  return db.account.findMany({
    where: {
      ...(opts.activeOnly ? { isActive: true } : {}),
      ...(opts.accountType ? { accountType: opts.accountType } : {}),
      ...(opts.bankOnly ? { bankKind: { not: null } } : {}),
    },
    orderBy: [{ accountNumber: 'asc' }, { name: 'asc' }],
  })
}

/** Bank and credit-card accounts — the register, transfer and deposit pickers. */
export const listBankAccounts = (db: TenantClient) =>
  listAccounts(db, { activeOnly: true, bankOnly: true })

/**
 * The whole chart as a tree, each node carrying its own balance and the rollup
 * of its subtree, plus how many posted lines it has (which decides whether it
 * can still be deleted).
 */
export async function accountTree(
  db: TenantClient,
  opts: { asOf?: Date; includeInactive?: boolean } = {},
): Promise<{ roots: AccountNode[]; flat: AccountRow[] }> {
  const accounts = await db.account.findMany({
    where: opts.includeInactive ? {} : { isActive: true },
    orderBy: [{ accountNumber: 'asc' }, { name: 'asc' }],
  })

  const [balances, counts] = await Promise.all([
    glBalances(db, accounts.map((a) => a.id), { asOf: opts.asOf }),
    db.transactionLine.groupBy({ by: ['accountId'], _count: { _all: true } }),
  ])
  const countById = new Map(counts.map((c) => [c.accountId, c._count._all]))

  const nodes = new Map<number, AccountNode>()
  for (const account of accounts) {
    nodes.set(account.id, {
      ...account,
      isControl: isControlNumber(account.accountNumber),
      controlPurpose: controlPurpose(account.accountNumber),
      balance: balances.get(account.id) ?? ZERO,
      rollup: ZERO,
      lineCount: countById.get(account.id) ?? 0,
      depth: 0,
      children: [],
    })
  }

  const roots: AccountNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  // Rollups bottom-up; depth top-down. Recursion is safe — the graph is a
  // forest by construction (see the cycle guard in updateAccount).
  const walk = (node: AccountNode, depth: number): Decimal => {
    node.depth = depth
    let total = node.balance
    for (const child of node.children) total = total.plus(walk(child, depth + 1))
    node.rollup = total
    return total
  }
  for (const root of roots) walk(root, 0)

  const flat: AccountRow[] = []
  const flatten = (list: AccountNode[]) => {
    for (const node of list) {
      flat.push(node)
      flatten(node.children)
    }
  }
  flatten(roots)

  return { roots, flat }
}

const cleanNumber = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

async function assertNumberFree(db: TenantClient, number: string | null, exceptId?: number) {
  if (!number) return
  const clash = await db.account.findFirst({ where: { accountNumber: number } })
  if (clash && clash.id !== exceptId) {
    throw new DomainError(
      `Account number ${number} is already used by "${clash.name}". Pick another number.`,
      409,
    )
  }
}

export type AccountInput = {
  name: string
  accountNumber?: string | null
  accountType: AccountType
  parentId?: number | null
  description?: string | null
  bankKind?: string | null
  isActive?: boolean
}

export async function createAccount(db: TenantClient, input: AccountInput) {
  const number = cleanNumber(input.accountNumber)
  await assertNumberFree(db, number)
  assertBankKind(input.bankKind, input.accountType)

  if (input.parentId) {
    const parent = await db.account.findUnique({ where: { id: input.parentId } })
    if (!parent) throw new DomainError('The parent account no longer exists.', 404)
  }

  return db.account.create({
    data: {
      name: input.name.trim(),
      accountNumber: number,
      accountType: input.accountType,
      parentId: input.parentId ?? null,
      description: input.description?.trim() || null,
      bankKind: input.bankKind || null,
      isActive: input.isActive ?? true,
      isSystem: false,
    },
  })
}

export async function updateAccount(
  db: TenantClient,
  id: number,
  patch: Partial<AccountInput>,
) {
  const account = await db.account.findUnique({ where: { id } })
  if (!account) throw new DomainError('Account not found.', 404)

  const number =
    patch.accountNumber === undefined ? account.accountNumber : cleanNumber(patch.accountNumber)
  const type = patch.accountType ?? account.accountType

  // Control accounts are resolved by number when a document posts. Renaming is
  // always fine; renumbering or retyping would silently break posting.
  if (isControlNumber(account.accountNumber)) {
    const purpose = controlPurpose(account.accountNumber)
    if (number !== account.accountNumber) {
      throw new DomainError(
        `${account.accountNumber} ${account.name} is a control account — the software finds it by its number to post ${purpose}. Changing its number would stop new documents reaching the ledger. You can rename it instead.`,
      )
    }
    if (type !== account.accountType) {
      throw new DomainError(
        `${account.accountNumber} ${account.name} is a control account — the software posts ${purpose} to it. Changing its type would misstate every report that uses it. You can rename it instead.`,
      )
    }
  }

  await assertNumberFree(db, number, id)

  const parentId = patch.parentId === undefined ? account.parentId : patch.parentId
  if (parentId != null) {
    if (parentId === id) throw new DomainError('An account cannot be its own parent.')
    // Walk up from the proposed parent: if we meet this account, the move
    // would create a loop and the tree walk would never terminate.
    let cursor: number | null = parentId
    const seen = new Set<number>()
    while (cursor != null) {
      if (cursor === id) {
        throw new DomainError(
          'That would put the account inside one of its own sub-accounts. Pick a different parent.',
        )
      }
      if (seen.has(cursor)) break
      seen.add(cursor)
      const next: { parentId: number | null } | null = await db.account.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      })
      if (!next) throw new DomainError('The parent account no longer exists.', 404)
      cursor = next.parentId
    }
  }

  const bankKind =
    patch.bankKind === undefined ? account.bankKind : (patch.bankKind || null)
  assertBankKind(bankKind, type)

  return db.account.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.accountNumber !== undefined ? { accountNumber: number } : {}),
      ...(patch.accountType !== undefined ? { accountType: type } : {}),
      ...(patch.parentId !== undefined ? { parentId: patch.parentId ?? null } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description?.trim() || null }
        : {}),
      ...(patch.bankKind !== undefined ? { bankKind } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    },
  })
}

export const setAccountActive = (db: TenantClient, id: number, isActive: boolean) =>
  updateAccount(db, id, { isActive })

/**
 * Delete only when nothing at all points at the account. Posted lines, feeds,
 * rules, sub-accounts and every other reference are refusals with a way out —
 * deactivating keeps history readable, which deleting never would.
 */
export async function deleteAccount(db: TenantClient, id: number) {
  const account = await db.account.findUnique({ where: { id } })
  if (!account) throw new DomainError('Account not found.', 404)

  if (isControlNumber(account.accountNumber)) {
    throw new DomainError(
      `${account.accountNumber} ${account.name} is a control account — the software posts ${controlPurpose(account.accountNumber)} to it by number, so it cannot be deleted. Rename it, or deactivate it to hide it from new entries.`,
    )
  }

  const lines = await db.transactionLine.count({ where: { accountId: id } })
  if (lines > 0) {
    throw new DomainError(
      `"${account.name}" has ${lines} posted transaction line${lines === 1 ? '' : 's'} and cannot be deleted. Deactivate it instead to hide it from new entries while keeping the history.`,
      409,
    )
  }

  const [children, feeds, rules, categorised, recons, budgets] = await Promise.all([
    db.account.count({ where: { parentId: id } }),
    db.bankAccount.count({ where: { accountId: id } }),
    db.bankRule.count({ where: { accountId: id } }),
    db.bankTransaction.count({ where: { categoryAccountId: id } }),
    db.reconciliation.count({ where: { accountId: id } }),
    db.budget.count({ where: { accountId: id } }),
  ])

  const uses: string[] = []
  if (children) uses.push(`${children} sub-account${children === 1 ? '' : 's'}`)
  if (feeds) uses.push(`${feeds} bank feed${feeds === 1 ? '' : 's'}`)
  if (rules) uses.push(`${rules} bank rule${rules === 1 ? '' : 's'}`)
  if (categorised) uses.push(`${categorised} statement line${categorised === 1 ? '' : 's'}`)
  if (recons) uses.push(`${recons} reconciliation${recons === 1 ? '' : 's'}`)
  if (budgets) uses.push(`${budgets} budget line${budgets === 1 ? '' : 's'}`)

  if (uses.length) {
    throw new DomainError(
      `"${account.name}" is still in use: ${uses.join(', ')}. Point those at another account first, or deactivate this one.`,
      409,
    )
  }

  try {
    await db.account.delete({ where: { id } })
  } catch {
    throw new DomainError(
      `"${account.name}" is still referenced by other records and cannot be deleted. Deactivate it instead.`,
      409,
    )
  }
  return { id }
}

/** The account the bank/register paths need — with the kind actually set. */
export async function requireBankLedgerAccount(db: TenantClient, accountId: number) {
  const account = await db.account.findUnique({ where: { id: accountId } })
  if (!account) throw new DomainError('Account not found.', 404)
  if (!account.bankKind) {
    throw new DomainError(
      `${account.name} is not a bank or credit-card account. Set its kind under Chart of accounts first.`,
    )
  }
  return account
}

export type AccountOption = {
  id: number
  label: string
  accountType: AccountType
  bankKind: string | null
}

/** Flat picker options, numbered first, for every <Select> in the module. */
export async function accountOptions(
  db: TenantClient,
  opts: { bankOnly?: boolean } = {},
): Promise<AccountOption[]> {
  const rows = await listAccounts(db, { activeOnly: true, bankOnly: opts.bankOnly })
  return rows.map((a) => ({
    id: a.id,
    label: a.accountNumber ? `${a.accountNumber} · ${a.name}` : a.name,
    accountType: a.accountType,
    bankKind: a.bankKind,
  }))
}

export type { Prisma }

/**
 * Turn a thrown domain failure into the `{ ok: false, error }` a server action
 * returns. Expected failures — a closed period, an unbalanced entry, a guard —
 * get their own words; anything else gets a safe sentence, because a Prisma
 * message is not something a bookkeeper should ever read.
 */
export function actionError(error: unknown): { ok: false; error: string } {
  if (error instanceof DomainError) return { ok: false, error: error.message }
  if (error instanceof ClosedPeriodError) {
    return {
      ok: false,
      error:
        'This period is closed. Change the date, or ask an admin to move the closing date.',
    }
  }
  if (error instanceof UnbalancedEntryError) {
    return {
      ok: false,
      error: `Debits and credits differ by ${error.debits.minus(error.credits).abs().toFixed(2)}. The entry must balance before it can be saved.`,
    }
  }
  if (error instanceof ForbiddenError) return { ok: false, error: error.message }
  if (
    error instanceof Error &&
    (error.message.startsWith('The account this posting needs') ||
      error.message.startsWith('Control account'))
  ) {
    return { ok: false, error: error.message }
  }
  return { ok: false, error: 'That could not be saved. Check the values and try again.' }
}

export type DimensionOption = { id: number; label: string }

/**
 * Class and job pickers. Both are optional dimensions on a posting, so both
 * lists are small, active-only and shaped the same way — a journal line and a
 * bank entry use the identical `<Select>`.
 */
export async function dimensionOptions(db: TenantClient): Promise<{
  classes: DimensionOption[]
  jobs: DimensionOption[]
}> {
  const [classes, jobs] = await Promise.all([
    db.trackingClass.findMany({ where: { isArchived: false }, orderBy: { name: 'asc' } }),
    db.job.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { customer: { select: { name: true } } },
    }),
  ])

  return {
    classes: classes.map((c) => ({ id: c.id, label: c.name })),
    jobs: jobs.map((j) => ({ id: j.id, label: `${j.customer.name}: ${j.name}` })),
  }
}
