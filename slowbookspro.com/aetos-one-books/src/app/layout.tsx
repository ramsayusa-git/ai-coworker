import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { getSession } from '@/server/auth'
import { brandStyle, getBrand } from '@/server/brand'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export async function generateMetadata(): Promise<Metadata> {
  const session = await getSession().catch(() => null)
  const brand = await getBrand(session?.orgId ?? null)
  return {
    title: { default: brand.productName, template: `%s · ${brand.productName}` },
    description: brand.tagline ?? 'Double-entry bookkeeping, invoicing, payroll and inventory.',
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession().catch(() => null)
  const brand = await getBrand(session?.orgId ?? null)

  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <head>
        {/* White-label: the org's palette is injected here, so a reseller's
            colours apply without a rebuild. */}
        <style dangerouslySetInnerHTML={{ __html: brandStyle(brand) }} />
      </head>
      <body className="min-h-full">
        <ThemeProvider
          attribute="class"
          defaultTheme={brand.defaultTheme}
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="bottom-right" closeButton richColors />
        </ThemeProvider>
      </body>
    </html>
  )
}
