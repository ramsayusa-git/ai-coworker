"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import { useBrand } from "@/components/brand-provider";
import { LoqioLogo } from "@/components/logo";

export default function LoginPage() {
  const router = useRouter();
  const brand = useBrand();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex justify-center">
          <LoqioLogo size={34} textClassName="text-xl font-semibold tracking-tight" imgClassName="h-9 max-w-[12rem] object-contain" />
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="you@company.com" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="••••••••" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-center text-xs text-zinc-500">
            New to {brand.brandName}? <a href="/register" className="text-emerald-600 hover:underline">Create an organization</a>
          </p>
          <p className="text-center text-xs text-zinc-400">
            <a href="/" className="hover:text-emerald-600 hover:underline">← Back to product overview</a>
          </p>
        </div>
      </form>
      {brand.footerText && <p className="mt-4 text-center text-[11px] text-zinc-400">{brand.footerText}</p>}
    </div>
  );
}
