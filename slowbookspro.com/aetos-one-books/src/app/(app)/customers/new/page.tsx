import { getAppContext } from '@/server/context'
import { PageHeader } from '@/components/app/page-header'
import { CustomerForm, emptyCustomer } from '../customer-form'

export const metadata = { title: 'New customer' }

export default async function NewCustomerPage() {
  const { features, settings } = await getAppContext()
  const noun = features.nonprofit ? 'donor' : 'customer'
  const defaultTerms = settings.get('default_payment_terms') === 'net_15' ? 'Net 15' : 'Net 30'

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`New ${noun}`}
        description={`Only the name is required — everything else can be filled in later.`}
      />
      <CustomerForm id={null} noun={noun} initial={{ ...emptyCustomer, terms: defaultTerms }} />
    </div>
  )
}
