'use client';
import { RequireRole } from '@/lib/auth';
import { AdminShell } from '@/components/admin-shell';

// Nav items + role filtering live in components/admin-shell.tsx (GROUPS).
const ALL_ROLES = ['ADMIN', 'OPS', 'MARKETING', 'SALES'];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole roles={ALL_ROLES}><AdminShell>{children}</AdminShell></RequireRole>;
}
