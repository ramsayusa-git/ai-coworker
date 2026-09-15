import { redirect } from 'next/navigation'
import { getSession } from '@/server/auth'

export default async function Home() {
  const session = await getSession().catch(() => null)
  if (!session) redirect('/sign-in')
  redirect(session.orgId ? '/dashboard' : '/select-company')
}
