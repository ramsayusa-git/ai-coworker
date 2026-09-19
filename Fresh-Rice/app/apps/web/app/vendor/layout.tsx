'use client';
import { RequireRole, useAuth } from '@/lib/auth';
export default function VendorLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  return <RequireRole roles={['VENDOR_USER']}><div className="min-h-screen">
    <header className="bg-gray-900 text-white px-4 py-3 flex justify-between items-center">
      <div className="font-bold">🌾 FreshRice · Vendor Portal</div>
      <div className="text-sm">{user?.name} · <button onClick={logout} className="underline">Logout</button></div>
    </header>
    <main className="p-4 max-w-5xl mx-auto">{children}</main>
  </div></RequireRole>;
}
