import { redirect } from 'next/navigation'
import { signIn, getSession } from '@/server/auth'
import { getBrand } from '@/server/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const existing = await getSession()
  if (existing?.orgId) redirect('/dashboard')
  const { error } = await searchParams
  const brand = await getBrand(null)

  async function action(formData: FormData) {
    'use server'
    const username = String(formData.get('username') ?? '')
    const password = String(formData.get('password') ?? '')
    try {
      const result = await signIn(username, password)
      redirect(result.activeOrgId ? '/dashboard' : '/select-company')
    } catch (e) {
      if (e && typeof e === 'object' && 'digest' in e) throw e
      redirect('/sign-in?error=1')
    }
  }

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground text-sm">Welcome back to {brand.productName}.</p>
      </div>

      {error && (
        <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm" role="alert">
          Incorrect username or password.
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input id="username" name="username" autoComplete="username" autoFocus required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <Button type="submit" className="w-full">Sign in</Button>
    </form>
  )
}
