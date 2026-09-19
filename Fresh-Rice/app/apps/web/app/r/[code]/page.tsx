import { redirect } from 'next/navigation';
export default async function Referral({ params }: { params: Promise<{ code: string }> }) { const { code } = await params; redirect('/login?referral=' + encodeURIComponent(code.toUpperCase())); }
