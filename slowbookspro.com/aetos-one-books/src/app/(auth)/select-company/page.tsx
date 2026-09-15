import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowRightIcon } from 'lucide-react'
import { controlDb } from '@/lib/control-db'
import { requireSession, switchOrg } from '@/server/auth'
import { Badge } from '@/components/ui/badge'

export default async function SelectCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>
}) {
  const session = await requireSession().catch(() => null)
  if (!session) redirect('/sign-in')

  const { org } = await searchParams
  if (org) {
    await switchOrg(Number(org))
    redirect('/dashboard')
  }

  const memberships = await controlDb.membership.findMany({
    where: { userId: session.user.id, isActive: true },
    include: { org: { include: { environment: true } } },
    orderBy: { lastAccessedAt: 'desc' },
  })

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a company</h1>
        <p className="text-muted-foreground text-sm">
          Each one lives in its own isolated environment.
        </p>
      </div>
      <ul className="space-y-2">
        {memberships.map((m) => (
          <li key={m.id}>
            <Link
              href={`/select-company?org=${m.orgId}`}
              className="hover:bg-accent flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{m.org.name}</p>
                <p className="text-muted-foreground text-xs">
                  {m.role.toLowerCase()} · {(m.org.environment?.tier ?? 'database').toLowerCase().replace('_', '-')} isolation
                </p>
              </div>
              {m.org.status !== 'ACTIVE' && (
                <Badge variant="warning" className="ml-auto">{m.org.status.toLowerCase()}</Badge>
              )}
              <ArrowRightIcon className="text-muted-foreground ml-auto size-4" />
            </Link>
          </li>
        ))}
        {memberships.length === 0 && (
          <li className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            You are not a member of any company yet.
          </li>
        )}
      </ul>
    </div>
  )
}
