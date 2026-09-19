'use client';
import { useEffect, useState } from 'react';
export type CartLine = { skuId: string; code: string; name: string; packKg: number; pricePaise: number; gstPct: number; qty: number };
const KEY = 'fr_cart';
export function readCart(): CartLine[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
export function writeCart(c: CartLine[]) { try { localStorage.setItem(KEY, JSON.stringify(c)); window.dispatchEvent(new Event('fr_cart')); } catch {} }
export function useCart() {
  const [cart, setCart] = useState<CartLine[]>([]);
  useEffect(() => { setCart(readCart()); const h = () => setCart(readCart()); window.addEventListener('fr_cart', h); return () => window.removeEventListener('fr_cart', h); }, []);
  const add = (l: Omit<CartLine, 'qty'>, qty = 1) => { const c = readCart(); const ex = c.find((x) => x.skuId === l.skuId); if (ex) ex.qty += qty; else c.push({ ...l, qty }); writeCart(c); };
  const setQty = (skuId: string, qty: number) => { let c = readCart(); c = c.map((x) => (x.skuId === skuId ? { ...x, qty } : x)).filter((x) => x.qty > 0); writeCart(c); };
  const clear = () => writeCart([]);
  const subtotal = cart.reduce((a, l) => a + l.pricePaise * l.qty, 0);
  const gst = cart.reduce((a, l) => a + Math.round((l.pricePaise * l.qty * l.gstPct) / 100), 0);
  const kg = cart.reduce((a, l) => a + l.packKg * l.qty, 0);
  return { cart, add, setQty, clear, subtotal, gst, total: subtotal + gst, kg, count: cart.reduce((a, l) => a + l.qty, 0) };
}
