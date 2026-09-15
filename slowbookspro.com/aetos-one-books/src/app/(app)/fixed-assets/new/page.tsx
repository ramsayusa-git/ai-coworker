import { getAppContext } from '@/server/context'
import { startOfToday, toDateInput } from '@/server/sales'
import { ensureDefaultAssetType } from '@/server/fixed-assets'
import { PageHeader } from '@/components/app/page-header'
import { AssetForm, type AssetTypeChoice } from '../asset-form'

export const metadata = { title: 'Register an asset' }

export default async function NewAssetPage() {
  const { db, settings } = await getAppContext()
  const currency = settings.get('base_currency') || 'USD'
  const types = await ensureDefaultAssetType(db)

  const choices: AssetTypeChoice[] = types
    .filter((type) => type.isActive)
    .map((type) => ({
      id: type.id,
      name: type.name,
      method: type.depreciationMethod,
      effectiveLifeYears: type.effectiveLifeYears?.toString() ?? null,
      annualRate: type.annualRate?.toString() ?? null,
    }))

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Register an asset"
        description="Put something you own on the register so it depreciates on schedule."
      />
      <AssetForm
        id={null}
        initial={{
          name: '',
          assetTypeId: choices[0]?.id ?? null,
          purchaseDate: toDateInput(startOfToday()),
          purchasePrice: '',
          salvageValue: '0.00',
          description: '',
        }}
        types={choices}
        currency={currency}
      />
    </div>
  )
}
