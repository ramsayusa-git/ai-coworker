import { notFound } from 'next/navigation'
import { getAppContext } from '@/server/context'
import { PageHeader } from '@/components/app/page-header'
import { expenseAccountOptions } from '../../../bills/editor-data'
import { VendorForm, type VendorDraft } from '../../vendor-form'

export const metadata = { title: 'Edit vendor' }

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { db } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const [vendor, expenseAccounts] = await Promise.all([
    db.vendor.findUnique({ where: { id } }),
    expenseAccountOptions(db),
  ])
  if (!vendor) notFound()

  const initial: VendorDraft = {
    name: vendor.name,
    companyName: vendor.companyName ?? '',
    email: vendor.email ?? '',
    phone: vendor.phone ?? '',
    fax: vendor.fax ?? '',
    website: vendor.website ?? '',
    address1: vendor.address1 ?? '',
    address2: vendor.address2 ?? '',
    city: vendor.city ?? '',
    state: vendor.state ?? '',
    zip: vendor.zip ?? '',
    country: vendor.country ?? 'US',
    terms: vendor.terms ?? 'Net 30',
    taxId: vendor.taxId ?? '',
    accountNumber: vendor.accountNumber ?? '',
    defaultExpenseAccountId: vendor.defaultExpenseAccountId,
    is1099Vendor: vendor.is1099Vendor,
    vendor1099Type: vendor.vendor1099Type ?? 'NEC',
    is1099Eligible: vendor.is1099Eligible,
    w9OnFile: vendor.w9OnFile,
    notes: vendor.notes ?? '',
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={`Edit ${vendor.name}`} description="Changes apply to new documents; posted history is untouched." />
      <VendorForm id={vendor.id} initial={initial} expenseAccounts={expenseAccounts} />
    </div>
  )
}
