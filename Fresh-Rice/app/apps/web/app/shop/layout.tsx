'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import { motion } from 'framer-motion';
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  const { count } = useCart(); const { user, logout } = useAuth(); const p = usePathname();
  const tabs = [['/shop', 'Shop'], ['/shop/subscriptions', 'Subscriptions'], ['/shop/orders', 'Orders'], ['/shop/account', 'Account']];
  return <div className="min-h-screen pb-20 max-w-2xl mx-auto">
    <header className="sticky top-0 z-40 bg-leaf-700 text-white px-4 py-3 flex items-center justify-between"><Link href="/shop" className="font-bold">🌾 FreshRice</Link>
      <div className="flex items-center gap-3 text-sm">{user ? <span className="opacity-80">{user.name || user.phone}</span> : <Link href="/login" className="underline">Login</Link>}<Link href="/shop/cart"><motion.span key={count} initial={{ scale: 1.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 12 }} className="inline-block bg-white text-leaf-700 rounded-full px-3 py-1 font-semibold">🛒 {count}</motion.span></Link></div></header>
    <main className="p-4">{children}</main>
    <nav className="fixed bottom-0 inset-x-0 bg-white border-t flex justify-around text-xs max-w-2xl mx-auto">{tabs.map(([h, l]) => <Link key={h} href={h} className={'py-3 flex-1 text-center ' + (p === h ? 'text-leaf-700 font-semibold' : 'text-gray-500')}>{l}</Link>)}</nav>
  </div>;
}
