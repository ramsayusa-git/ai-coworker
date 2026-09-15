'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PackageCheckIcon, ReceiptIcon, SendIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ActionButton } from '@/components/app/confirm-action'
import { Field } from '@/components/app/sales-field'
import { MoneyInput } from '@/components/app/money-input'
import {
  convertPurchaseOrderAction,
  receivePurchaseOrderAction,
  setPurchaseOrderStatusAction,
} from '../actions'

export type ReceivableLine = {
  id: number
  label: string
  ordered: string
  received: string
}

export function PurchaseOrderActions({
  id,
  poNumber,
  status,
  lines,
  today,
}: {
  id: number
  poNumber: string
  status: string
  lines: ReceivableLine[]
  today: string
}) {
  if (status === 'CLOSED') return null

  return (
    <>
      {status === 'DRAFT' && (
        <ActionButton
          label="Mark as sent"
          icon={<SendIcon />}
          successMessage="Order marked as sent"
          action={() => setPurchaseOrderStatusAction({ id, status: 'SENT' })}
        />
      )}
      <ReceiveDialog id={id} lines={lines} />
      <ConvertDialog id={id} poNumber={poNumber} today={today} />
    </>
  )
}

function ReceiveDialog({ id, lines }: { id: number; lines: ReceivableLine[] }) {
  const [open, setOpen] = React.useState(false)
  const [quantities, setQuantities] = React.useState<Record<number, string>>(() =>
    Object.fromEntries(lines.map((line) => [line.id, line.received])),
  )
  const [pending, startTransition] = React.useTransition()

  const receiveAll = () =>
    setQuantities(Object.fromEntries(lines.map((line) => [line.id, line.ordered])))

  const submit = () => {
    startTransition(async () => {
      const result = await receivePurchaseOrderAction({
        id,
        lines: lines.map((line) => ({ lineId: line.id, quantity: quantities[line.id] ?? '0' })),
      })
      if (result.ok) {
        toast.success('Receipt recorded')
        setOpen(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <PackageCheckIcon /> Receive
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What turned up?</DialogTitle>
            <DialogDescription>
              Receiving records quantities only — no money and no stock move here. The bill does
              both, so enter it when the invoice arrives.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Line</TableHead>
                  <TableHead numeric>Ordered</TableHead>
                  <TableHead numeric className="w-32">Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="max-w-64 truncate">{line.label}</TableCell>
                    <TableCell numeric>{line.ordered}</TableCell>
                    <TableCell numeric>
                      <MoneyInput
                        value={quantities[line.id] ?? '0'}
                        places={4}
                        onValueChange={(value) =>
                          setQuantities((current) => ({ ...current, [line.id]: value }))
                        }
                        aria-label={`Quantity received for ${line.label}`}
                        className="h-8"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={receiveAll} disabled={pending}>
              Receive everything
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? 'Saving…' : 'Record receipt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ConvertDialog({ id, poNumber, today }: { id: number; poNumber: string; today: string }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [date, setDate] = React.useState(today)
  const [billNumber, setBillNumber] = React.useState(`BILL-${poNumber}`)
  const [pending, startTransition] = React.useTransition()

  const submit = () => {
    startTransition(async () => {
      const result = await convertPurchaseOrderAction({ id, date, billNumber })
      if (result.ok) {
        toast.success(`${result.billNumber} created`)
        setOpen(false)
        router.push(`/bills/${result.billId}`)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <ReceiptIcon /> Convert to bill
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Turn {poNumber} into a bill</DialogTitle>
            <DialogDescription>
              The bill posts straight away — expense, or inventory for stock, against accounts
              payable — and this order closes.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bill number" htmlFor="convert-number" hint="Use the vendor's own number when you have it.">
              <Input
                id="convert-number"
                value={billNumber}
                onChange={(event) => setBillNumber(event.target.value)}
              />
            </Field>
            <Field label="Bill date" htmlFor="convert-date">
              <Input
                id="convert-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? 'Creating…' : 'Create bill'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
