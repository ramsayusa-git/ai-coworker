import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
export const metadata: Metadata = { title: 'FreshRice — Traceable rice, delivered in Hyderabad', description: 'Mill-direct, correctly aged Telangana rice with lot traceability. Subscriptions for homes, bulk supply with GST invoices for PGs and restaurants.', manifest: '/manifest.json', icons: '/icon.svg' };
export const viewport: Viewport = { themeColor: '#2e7d4f', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><AuthProvider>{children}</AuthProvider></body></html>;
}
