import { notFound } from 'next/navigation'
import { getAppContext } from '@/server/context'
import { PageHeader } from '@/components/app/page-header'
import { CustomerForm, type CustomerDraft } from '../../customer-form'

export const metadata = { title: 'Edit customer' }

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { db, features } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const customer = await db.customer.findUnique({ where: { id } })
  if (!customer) notFound()

  const noun = features.nonprofit ? 'donor' : 'customer'
  const initial: CustomerDraft = {
    name: customer.name,
    companyName: customer.companyName ?? '',
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    mobile: customer.mobile ?? '',
    website: customer.website ?? '',
    billAddress1: customer.billAddress1 ?? '',
    billAddress2: customer.billAddress2 ?? '',
    billCity: customer.billCity ?? '',
    billState: customer.billState ?? '',
    billZip: customer.billZip ?? '',
    shipAddress1: customer.shipAddress1 ?? '',
    shipAddress2: customer.shipAddress2 ?? '',
    shipCity: customer.shipCity ?? '',
    shipState: customer.shipState ?? '',
    shipZip: customer.shipZip ?? '',
    terms: customer.terms ?? 'Net 30',
    creditLimit: customer.creditLimit ? customer.creditLimit.toString() : '',
    taxId: customer.taxId ?? '',
    isTaxable: customer.isTaxable,
    notes: customer.notes ?? '',
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={customer.name} description={`Edit this ${noun}.`} />
      <CustomerForm id={customer.id} noun={noun} initial={initial} />
    </div>
  )
}
