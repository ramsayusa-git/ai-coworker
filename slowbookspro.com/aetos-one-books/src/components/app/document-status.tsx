import { Badge } from '@/components/ui/badge'

/**
 * Status as a word, always — never a bare colour. The tone reinforces the
 * label for people who read colour quickly; the label carries the meaning for
 * everyone else.
 */

type Tone = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive' | 'muted'

const INVOICE: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'muted' },
  SENT: { label: 'Sent', tone: 'default' },
  PARTIAL: { label: 'Part paid', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  VOID: { label: 'Void', tone: 'destructive' },
}

const ESTIMATE: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'Pending', tone: 'muted' },
  ACCEPTED: { label: 'Accepted', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'destructive' },
  CONVERTED: { label: 'Converted', tone: 'default' },
}

const CREDIT_MEMO: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'muted' },
  ISSUED: { label: 'Open credit', tone: 'default' },
  APPLIED: { label: 'Fully applied', tone: 'success' },
  VOID: { label: 'Void', tone: 'destructive' },
}

const MAPS = { invoice: INVOICE, estimate: ESTIMATE, creditMemo: CREDIT_MEMO }

export function DocumentStatus({
  kind,
  status,
  overdue,
}: {
  kind: keyof typeof MAPS
  status: string
  /** Invoices only: past the due date with a balance outstanding. */
  overdue?: boolean
}) {
  const map = MAPS[kind]
  const entry = map[status] ?? { label: status.toLowerCase(), tone: 'muted' as Tone }
  if (overdue && (status === 'SENT' || status === 'PARTIAL')) {
    return <Badge variant="destructive">Overdue</Badge>
  }
  return <Badge variant={entry.tone}>{entry.label}</Badge>
}

export function isOverdue(dueDate: Date | null, balanceDue: { toString(): string }, status: string) {
  if (status !== 'SENT' && status !== 'PARTIAL') return false
  if (!dueDate) return false
  if (Number(balanceDue.toString()) <= 0) return false
  const today = new Date()
  return dueDate.getTime() < Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
}
