import { notFound } from 'next/navigation'
import { getAppContext } from '@/server/context'
import { toDateInput } from '@/server/sales'
import { PageHeader } from '@/components/app/page-header'
import { AssetForm, type AssetTypeChoice } from '../../asset-form'

export const metadata = { title: 'Edit asset' }

export default async function EditAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, settings } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const [asset, types] = await Promise.all([
    db.fixedAsset.findUnique({ where: { id } }),
    db.fixedAssetType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  ])
  if (!asset) notFound()

  const currency = settings.get('base_currency') || 'USD'
  const choices: AssetTypeChoice[] = types.map((type) => ({
    id: type.id,
    name: type.name,
    method: type.depreciationMethod,
    effectiveLifeYears: type.effectiveLifeYears?.toString() ?? null,
    annualRate: type.annualRate?.toString() ?? null,
  }))

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={`Edit ${asset.assetNumber}`}
        description="Depreciation already posted stays where it is; only the schedule from here on changes."
      />
      <AssetForm
        id={asset.id}
        initial={{
          name: asset.name,
          assetTypeId: asset.assetTypeId,
          purchaseDate: toDateInput(asset.purchaseDate),
          purchasePrice: asset.purchasePrice.toString(),
          salvageValue: asset.salvageValue.toString(),
          description: asset.description ?? '',
        }}
        types={choices}
        currency={currency}
      />
    </div>
  )
}
