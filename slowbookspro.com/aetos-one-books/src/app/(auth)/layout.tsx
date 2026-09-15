import { getBrand } from '@/server/brand'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const brand = await getBrand(null)
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </div>
      <div className="bg-primary/5 hidden flex-col justify-between border-l p-12 lg:flex">
        <div className="flex items-center gap-2">
          <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg text-sm font-bold">
            {brand.shortName.slice(0, 2)}
          </span>
          <span className="font-semibold">{brand.productName}</span>
        </div>
        <div className="space-y-4">
          <p className="text-2xl leading-snug font-medium text-balance">
            {brand.tagline ?? 'Bookkeeping that stays yours.'}
          </p>
          <ul className="text-muted-foreground space-y-2 text-sm">
            <li>· Double-entry ledger, invoicing, bills and banking</li>
            <li>· US payroll with tamper-evident tax forms</li>
            <li>· Perpetual inventory and job costing</li>
            <li>· Every company in its own isolated database</li>
          </ul>
        </div>
        {!brand.hideVendorMarks && (
          <p className="text-muted-foreground text-xs">Built by {brand.vendorName}</p>
        )}
      </div>
    </div>
  )
}
