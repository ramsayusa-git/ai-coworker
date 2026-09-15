import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight,
  BadgeDollarSign,
  BarChart3,
  Banknote,
  BookOpen,
  Boxes,
  Briefcase,
  Building2,
  CalendarClock,
  ClipboardList,
  CreditCard,
  FileText,
  FolderKanban,
  Gauge,
  HandCoins,
  Heart,
  Landmark,
  type LucideProps,
  Receipt,
  Repeat,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  UserSquare,
  Wallet,
  Wrench,
} from 'lucide-react'

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon | ((props: LucideProps) => React.ReactElement)
  /** Minimum role required to see it at all. */
  minRole?: 'READONLY' | 'BOOKKEEPER' | 'ADMIN' | 'OWNER'
  /** Hidden unless the org has this feature switched on. */
  feature?: 'payroll' | 'inventory' | 'nonprofit' | 'jobs' | 'ai'
  /** Keywords for the command palette. */
  keywords?: string[]
}

export type NavSection = { title: string; items: NavItem[] }

export const NAV: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: Gauge, keywords: ['home', 'kpi'] },
      { label: 'Reports', href: '/reports', icon: BarChart3, keywords: ['p&l', 'balance sheet', 'trial balance'] },
      { label: 'Analytics', href: '/analytics', icon: Sparkles, keywords: ['forecast', 'cash', 'trends'] },
    ],
  },
  {
    title: 'Sales',
    items: [
      { label: 'Customers', href: '/customers', icon: Users, keywords: ['client', 'donor'] },
      { label: 'Invoices', href: '/invoices', icon: FileText, keywords: ['ar', 'billing'] },
      { label: 'Estimates', href: '/estimates', icon: ClipboardList, keywords: ['quote', 'proposal'] },
      { label: 'Sales receipts', href: '/sales-receipts', icon: Receipt },
      { label: 'Payments received', href: '/payments', icon: HandCoins, keywords: ['receipt', 'apply'] },
      { label: 'Credit memos', href: '/credit-memos', icon: ScrollText },
      { label: 'Recurring', href: '/recurring', icon: Repeat, keywords: ['subscription', 'schedule'] },
    ],
  },
  {
    title: 'Purchases',
    items: [
      { label: 'Vendors', href: '/vendors', icon: Truck, keywords: ['supplier'] },
      { label: 'Bills', href: '/bills', icon: Receipt, keywords: ['ap'] },
      { label: 'Bill payments', href: '/bill-payments', icon: Wallet },
      { label: 'Purchase orders', href: '/purchase-orders', icon: ShoppingCart, keywords: ['po'] },
      { label: 'Vendor credits', href: '/vendor-credits', icon: ScrollText },
      { label: 'Expenses', href: '/expenses', icon: CreditCard, keywords: ['card', 'spend'] },
    ],
  },
  {
    title: 'Banking',
    items: [
      { label: 'Bank & cards', href: '/banking', icon: Landmark, keywords: ['register', 'feed'] },
      { label: 'Reconcile', href: '/banking/reconcile', icon: ShieldCheck, keywords: ['statement', 'clear'] },
      { label: 'Rules', href: '/banking/rules', icon: Wrench, keywords: ['categorise', 'auto'] },
      { label: 'Transfers', href: '/transfers', icon: ArrowLeftRight },
      { label: 'Deposits', href: '/deposits', icon: Banknote },
    ],
  },
  {
    title: 'Accounting',
    items: [
      { label: 'Chart of accounts', href: '/accounts', icon: BookOpen, keywords: ['coa', 'ledger'] },
      { label: 'Journal entries', href: '/journal', icon: BookOpen, keywords: ['je', 'manual'] },
      { label: 'Items', href: '/items', icon: Boxes, keywords: ['product', 'service', 'inventory'] },
      { label: 'Fixed assets', href: '/fixed-assets', icon: Building2, keywords: ['depreciation'] },
      { label: 'Budgets', href: '/budgets', icon: BadgeDollarSign },
      { label: 'Sales tax', href: '/tax', icon: BadgeDollarSign, keywords: ['vat', 'remit'] },
    ],
  },
  {
    title: 'Projects',
    items: [
      { label: 'Jobs', href: '/jobs', icon: FolderKanban, feature: 'jobs', keywords: ['project', 'customer:job'] },
      { label: 'Job costing', href: '/job-costing', icon: Briefcase, feature: 'jobs' },
      { label: 'Time entries', href: '/time-entries', icon: CalendarClock },
      { label: 'Classes', href: '/classes', icon: FolderKanban, keywords: ['fund', 'department'] },
    ],
  },
  {
    title: 'Payroll',
    items: [
      { label: 'Employees', href: '/employees', icon: UserSquare, feature: 'payroll', minRole: 'ADMIN' },
      { label: 'Pay runs', href: '/payroll', icon: Banknote, feature: 'payroll', minRole: 'ADMIN' },
      { label: 'Benefits', href: '/benefits', icon: Heart, feature: 'payroll', minRole: 'ADMIN' },
      { label: 'PTO', href: '/pto', icon: CalendarClock, feature: 'payroll', minRole: 'ADMIN' },
      { label: 'Tax forms', href: '/tax-forms', icon: FileText, feature: 'payroll', minRole: 'ADMIN' },
    ],
  },
  {
    title: 'Nonprofit',
    items: [
      { label: 'Donors', href: '/donors', icon: Heart, feature: 'nonprofit' },
      { label: 'Funds', href: '/funds', icon: FolderKanban, feature: 'nonprofit' },
      { label: 'In-kind gifts', href: '/in-kind', icon: HandCoins, feature: 'nonprofit' },
    ],
  },
  {
    title: 'Settings',
    items: [
      { label: 'Company', href: '/settings', icon: Settings, minRole: 'ADMIN' },
      { label: 'Branding', href: '/settings/branding', icon: Sparkles, minRole: 'ADMIN', keywords: ['white label', 'logo', 'colours'] },
      { label: 'Users & roles', href: '/settings/users', icon: Users, minRole: 'ADMIN' },
      { label: 'Environment', href: '/settings/environment', icon: ShieldCheck, minRole: 'ADMIN', keywords: ['isolation', 'database', 'backup'] },
    ],
  },
]

export const ROLE_ORDER = { READONLY: 10, BOOKKEEPER: 20, ADMIN: 30, OWNER: 40 } as const
