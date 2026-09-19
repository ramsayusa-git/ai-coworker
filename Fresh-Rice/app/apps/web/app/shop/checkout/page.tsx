'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { api, fetcher, paise, tomorrow } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import { AddressForm } from '@/components/address-form';
import { Field } from '@/components/ui';
export default function Checkout() {
  const { cart, total, kg, clear, subtotal } = useCart(); const { user, loading } = useAuth(); const router = useRouter();
  const { data: addresses, mutate } = useSWR(user ? '/addresses' : null, fetcher);
  const [addressId, setAddressId] = useState(''); const [slotId, setSlotId] = useState(''); const [date, setDate] = useState(tomorrow()); const [method, setMethod] = useState('UPI'); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [showAddr, setShowAddr] = useState(false); const [coupon, setCoupon] = useState(''); const [couponRes, setCouponRes] = useState<any>(null); const { data: myOrders } = useSWR(user ? '/orders/mine' : null, fetcher); const { data: me } = useSWR(user ? '/auth/me' : null, fetcher); const firstOrder = myOrders && !myOrders.some((o: any) => !['CANCELLED', 'FAILED'].includes(o.status)); const referralOff = firstOrder && me?.referredById ? 10000 : 0;
  useEffect(() => { if (!loading && !user) router.replace('/login?next=/shop/checkout'); }, [user, loading]);
  useEffect(() => { if (addresses?.length && !addressId) setAddressId(addresses[0].id); }, [addresses]);
  const addr = addresses?.find((a: any) => a.id === addressId);
  const { data: zone } = useSWR(addr ? `/zones/check?pincode=${addr.pincode}&date=${date}` : null, fetcher);
  const place = async () => { setBusy(true); setErr(''); try {
    const o = await api('/orders', { body: { addressId, slotId: slotId || undefined, deliveryDate: date, items: cart.map((l) => ({ skuId: l.skuId, qty: l.qty })), paymentMethod: method, couponCode: couponRes?.code, idempotencyKey: 'web:' + user.id + ':' + Date.now() } });
    clear(); router.replace('/shop/orders/' + o.id + '?placed=1'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  if (!cart.length) return <div className="text-gray-500">Cart is empty.</div>;
  return <div><h1 className="text-xl font-bold mb-3">Checkout</h1>
    <div className="card mb-3"><div className="font-semibold mb-2">Deliver to</div>
      {addresses?.map((a: any) => <label key={a.id} className={'block border rounded-lg p-2 mb-2 text-sm cursor-pointer ' + (addressId === a.id ? 'border-leaf-600 bg-green-50' : '')}><input type="radio" className="mr-2" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />{a.line1}{a.complex ? ', ' + a.complex : ''} · {a.pincode} {a.zone ? <span className="badge bg-green-100 text-green-700 ml-1">{a.zone.name}</span> : <span className="badge bg-red-100 text-red-700 ml-1">not serviceable</span>}</label>)}
      {showAddr ? <AddressForm onSaved={(a) => { mutate(); setAddressId(a.id); setShowAddr(false); }} /> : <button className="btn-secondary" onClick={() => setShowAddr(true)}>+ Add address</button>}</div>
    <div className="card mb-3 grid grid-cols-2 gap-2"><Field label="Delivery date"><input type="date" className="input" value={date} min={tomorrow()} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Slot"><select className="input" value={slotId} onChange={(e) => setSlotId(e.target.value)}><option value="">Any</option>{zone?.slots?.map((s: any) => <option key={s.id} value={s.id} disabled={s.available <= 0}>{s.label}{s.available <= 0 ? ' (full)' : ''}</option>)}</select></Field></div>
    <div className="card mb-3"><div className="font-semibold mb-2">Payment</div>{['UPI', 'CARD', 'WALLET', 'COD'].map((m) => <label key={m} className="block text-sm py-1"><input type="radio" className="mr-2" checked={method === m} onChange={() => setMethod(m)} />{({ UPI: 'UPI (GPay / PhonePe)', CARD: 'Card', WALLET: `Wallet (${paise(user?.walletBalance)})`, COD: 'Cash on delivery' } as Record<string, string>)[m]}</label>)}</div>
    <div className="card mb-3"><div className="font-semibold mb-2">Coupon</div><div className="flex gap-2"><input className="input" placeholder="Code" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} /><button className="btn-secondary" onClick={async () => { try { setCouponRes(await api('/coupons/check', { body: { code: coupon, subtotalPaise: subtotal } })); setErr(''); } catch (e: any) { setCouponRes(null); setErr(e.message); } }}>Apply</button></div>{couponRes && <div className="text-sm text-leaf-700 mt-1">{couponRes.code}: −{paise(couponRes.discountPaise)}</div>}</div>
    <div className="card text-sm">{referralOff > 0 && subtotal >= 50000 && <div className="flex justify-between text-leaf-700"><span>Referral welcome</span><span>−{paise(referralOff)}</span></div>}<div className="flex justify-between font-bold text-base"><span>Total ({kg} kg)</span><span>{paise(total - (couponRes?.discountPaise || 0) - (subtotal >= 50000 ? referralOff : 0))}</span></div></div>
    {err && <div className="text-red-600 text-sm mt-2">{err}</div>}
    <button className="btn-primary w-full mt-4" disabled={!addressId || !addr?.zone || busy} onClick={place}>{busy ? 'Placing…' : 'Place order'}</button></div>;
}
