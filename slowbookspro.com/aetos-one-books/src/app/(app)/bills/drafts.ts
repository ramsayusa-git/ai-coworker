import type { PurchaseLine } from '@/components/app/purchase-line-editor'
import type { BillDraft } from './bill-editor'
import type { PurchaseOrderDraft } from '../purchase-orders/po-editor'
import type { VendorCreditDraft } from '../vendor-credits/credit-editor'

/**
 * Blank drafts for the three purchase editors.
 *
 * These live outside the editors themselves because a Server Component builds
 * the starting draft and hands it down as a prop — a function exported from a
 * `'use client'` module cannot be called on the server, only rendered.
 */

let counter = 0
const blankLine = (): PurchaseLine => ({
  key: `pline-${(counter += 1)}-${Math.random().toString(36).slice(2, 8)}`,
  itemId: null,
  accountId: null,
  description: '',
  quantity: '1',
  rate: '',
})

const DAY_MS = 86_400_000
const IMMEDIATE_TERMS = new Set(['due on receipt', 'due upon receipt', 'cod', 'net 0'])

/** Mirrors the server's terms parsing so the due date never surprises anyone. */
export function deriveDueDate(date: string, terms: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ''
  const base = new Date(`${date}T00:00:00Z`)
  const normalised = terms.trim().toLowerCase()
  let days = 30
  if (IMMEDIATE_TERMS.has(normalised)) days = 0
  else {
    const parsed = Number.parseInt(normalised.replace('net', '').trim(), 10)
    if (Number.isFinite(parsed)) days = parsed
  }
  return new Date(base.getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

export const newBillDraft = (date: string, terms = 'Net 30'): BillDraft => ({
  vendorId: null,
  billNumber: '',
  date,
  dueDate: deriveDueDate(date, terms),
  terms,
  refNumber: '',
  taxRatePercent: '0',
  notes: '',
  lines: [blankLine(), blankLine(), blankLine()],
})

export const newPurchaseOrderDraft = (date: string): PurchaseOrderDraft => ({
  vendorId: null,
  date,
  expectedDate: '',
  shipTo: '',
  taxRatePercent: '0',
  notes: '',
  lines: [blankLine(), blankLine(), blankLine()],
})

export const newVendorCreditDraft = (date: string): VendorCreditDraft => ({
  vendorId: null,
  date,
  originalBillId: null,
  refNumber: '',
  taxRatePercent: '0',
  notes: '',
  lines: [blankLine(), blankLine()],
})
