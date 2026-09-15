import { Badge } from '@/components/ui/badge'

/**
 * A bill's state as a word, never a bare colour. Overdue wins over "unpaid"
 * because it is the thing a person needs to act on.
 */

type Tone = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive' | 'muted'

const BILL: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'muted' },
  UNPAID: { label: 'Unpaid', tone: 'default' },
  PARTIAL: { label: 'Part paid', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  VOID: { label: 'Void', tone: 'destructive' },
}

export function isBillOverdue(
  dueDate: Date | null,
  balanceDue: { toString(): string },
  status: string,
) {
  if (status !== 'UNPAID' && status !== 'PARTIAL') return false
  if (!dueDate) return false
  if (Number(balanceDue.toString()) <= 0) return false
  const today = new Date()
  return (
    dueDate.getTime() < Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  )
}

export function BillStatusBadge({
  status,
  dueDate,
  balanceDue,
}: {
  status: string
  dueDate?: Date | null
  balanceDue?: string
}) {
  if (dueDate !== undefined && balanceDue !== undefined && isBillOverdue(dueDate ?? null, balanceDue, status)) {
    return <Badge variant="destructive">Overdue</Badge>
  }
  const entry = BILL[status] ?? { label: status.toLowerCase(), tone: 'muted' as Tone }
  return <Badge variant={entry.tone}>{entry.label}</Badge>
}

const VENDOR_CREDIT: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'muted' },
  ISSUED: { label: 'Open credit', tone: 'default' },
  APPLIED: { label: 'Fully applied', tone: 'success' },
  VOID: { label: 'Void', tone: 'destructive' },
}

export function VendorCreditStatusBadge({ status }: { status: string }) {
  const entry = VENDOR_CREDIT[status] ?? { label: status.toLowerCase(), tone: 'muted' as Tone }
  return <Badge variant={entry.tone}>{entry.label}</Badge>
}

const PO: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'muted' },
  SENT: { label: 'Sent', tone: 'default' },
  PARTIAL: { label: 'Part received', tone: 'warning' },
  RECEIVED: { label: 'Received', tone: 'success' },
  CLOSED: { label: 'Billed', tone: 'secondary' },
}

export function PoStatusBadge({ status }: { status: string }) {
  const entry = PO[status] ?? { label: status.toLowerCase(), tone: 'muted' as Tone }
  return <Badge variant={entry.tone}>{entry.label}</Badge>
}
