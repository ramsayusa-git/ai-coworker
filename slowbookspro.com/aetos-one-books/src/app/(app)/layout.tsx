import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/app/sidebar'
import { Topbar } from '@/components/app/topbar'
import { getAppContext } from '@/server/context'
import { AuthError } from '@/server/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let ctx
  try {
    ctx = await getAppContext()
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(error.message === 'No company selected' ? '/select-company' : '/sign-in')
    }
    throw error
  }

  const org = {
    id: ctx.org.id,
    name: ctx.org.name,
    slug: ctx.org.slug,
    tier: ctx.org.environment?.tier ?? 'DATABASE',
  }

  return (
    <div className="flex h-svh overflow-hidden">
      <Sidebar
        role={ctx.session.role}
        features={ctx.features}
        brand={{
          productName: ctx.brand.productName,
          shortName: ctx.brand.shortName,
          logoLight: ctx.brand.logoLight,
          logoDark: ctx.brand.logoDark,
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          org={org}
          orgs={ctx.orgs}
          user={ctx.session.user}
          role={ctx.session.role}
          features={ctx.features}
        />
        <main className="scrollbar-thin flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </div>
  )
}
