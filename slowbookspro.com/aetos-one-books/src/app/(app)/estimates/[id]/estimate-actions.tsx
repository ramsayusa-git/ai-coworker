'use client'
import { useRouter } from 'next/navigation'
import { CheckIcon, FileTextIcon, RotateCcwIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { ActionButton, ConfirmAction } from '@/components/app/confirm-action'
import { convertEstimateAction, setEstimateStatusAction } from '../actions'

/**
 * The three things that ever happen to an estimate: the customer says yes, the
 * customer says no, or it becomes an invoice. Conversion is the only one that
 * touches the ledger, so it is the only one behind a confirmation.
 */
export function EstimateStatusActions({ id, status }: { id: number; status: string }) {
  const router = useRouter()
  const converted = status === 'CONVERTED'

  return (
    <>
      {!converted && status !== 'ACCEPTED' && (
        <ActionButton
          label="Mark accepted"
          icon={<CheckIcon />}
          successMessage="Estimate marked as accepted"
          action={() => setEstimateStatusAction({ id, status: 'ACCEPTED' })}
        />
      )}
      {!converted && status !== 'REJECTED' && (
        <ActionButton
          label="Mark rejected"
          icon={<XIcon />}
          successMessage="Estimate marked as rejected"
          action={() => setEstimateStatusAction({ id, status: 'REJECTED' })}
        />
      )}
      {!converted && status !== 'PENDING' && (
        <ActionButton
          label="Reopen"
          icon={<RotateCcwIcon />}
          successMessage="Estimate is pending again"
          action={() => setEstimateStatusAction({ id, status: 'PENDING' })}
        />
      )}
      {!converted && (
        <ConfirmAction
          label="Convert to invoice"
          icon={<FileTextIcon />}
          variant="default"
          confirmVariant="default"
          title="Turn this estimate into an invoice?"
          description="A new invoice is created from these lines and posted straight away: accounts receivable is debited and income credited. The estimate stays as history and cannot be edited afterwards."
          confirmLabel="Create the invoice"
          successMessage="Invoice created from this estimate"
          action={async () => {
            const result = await convertEstimateAction({ id })
            if (result.ok) {
              toast.message(`Invoice ${result.invoiceNumber} created`)
              router.push(`/invoices/${result.invoiceId}`)
            }
            return result
          }}
        />
      )}
    </>
  )
}
