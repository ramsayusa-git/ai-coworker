import { redirect } from 'next/navigation'
import { getSession } from '@/server/auth'
import { Navbar } from '@/components/marketing/navbar'
import { Hero } from '@/components/marketing/hero'
import { Features, StatsBand } from '@/components/marketing/features'
import { Compare } from '@/components/marketing/compare'
import { Pricing } from '@/components/marketing/pricing'
import { Testimonials, CTASection, Footer } from '@/components/marketing/testimonials-cta-footer'

export default async function Home() {
  const session = await getSession().catch(() => null)
  if (session) redirect(session.orgId ? '/dashboard' : '/select-company')

  return (
    <div className="relative">
      <Navbar />
      <main>
        <Hero />
        <StatsBand />
        <Features />
        <Compare />
        <Pricing />
        <Testimonials />
        <CTASection />
      </main>
      <Footer />
    </div>
  )
}
