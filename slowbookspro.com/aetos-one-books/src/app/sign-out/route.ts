import { NextResponse } from 'next/server'
import { signOut } from '@/server/auth'
import { env } from '@/lib/env'

export async function GET() {
  await signOut()
  return NextResponse.redirect(new URL('/sign-in', env.appUrl))
}
