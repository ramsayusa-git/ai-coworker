'use client';
import Link from 'next/link';
import { useCart } from '@/lib/cart';
import { paise } from '@/lib/api';
import { Empty } from '@/components/ui';
export default function Cart() {
  const { cart, setQty, subtotal, gst, total, kg } = useCart();
  if (!cart.length) return <Empty text="Your cart is empty" />;
  return <div><h1 className="text-xl font-bold mb-3">Cart</h1>
    {cart.map((l) => <div key={l.skuId} className="card mb-2 flex justify-between items-center"><div><div className="font-medium">{l.name} {l.packKg}kg</div><div className="text-xs text-gray-500">{paise(l.pricePaise)} each</div></div>
      <div className="flex items-center gap-2"><button className="btn-secondary !px-3" onClick={() => setQty(l.skuId, l.qty - 1)}>−</button><span className="w-6 text-center">{l.qty}</span><button className="btn-secondary !px-3" onClick={() => setQty(l.skuId, l.qty + 1)}>+</button></div></div>)}
    <div className="card mt-4 text-sm"><div className="flex justify-between"><span>Subtotal ({kg} kg)</span><span>{paise(subtotal)}</span></div><div className="flex justify-between"><span>GST (5% on packed rice)</span><span>{paise(gst)}</span></div><div className="flex justify-between"><span>Delivery</span><span className="text-leaf-700">Free</span></div><div className="flex justify-between font-bold text-base mt-2 border-t pt-2"><span>Total</span><span>{paise(total)}</span></div></div>
    <Link href="/shop/checkout" className="btn-primary w-full mt-4">Checkout →</Link></div>;
}
