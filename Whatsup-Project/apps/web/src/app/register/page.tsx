"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { register } from "@/lib/api";
import { useBrand } from "@/components/brand-provider";

export default function RegisterPage() {
  const router = useRouter();
  const brand = useBrand();
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      await register({ name, orgName, email, password });
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex justify-center">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt={brand.brandName} className="h-9 max-w-[12rem] object-contain" />
          ) : (
            <span className="text-xl font-semibold" style={{ color: brand.primaryColor }}>{brand.brandName}</span>
          )}
        </div>
        <p className="mb-4 text-center text-sm text-zinc-500">Create your organization</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500">Organization name</label>
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} required
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="Acme Store" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Your name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="Jane Doe" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="you@company.com" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="At least 8 characters" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {loading ? "Creating…" : "Create organization"}
          </button>
          <p className="text-center text-xs text-zinc-500">
            Already have an account? <a href="/login" className="text-emerald-600 hover:underline">Sign in</a>
          </p>
          <p className="text-center text-xs text-zinc-400">
            <a href="/product" className="hover:text-emerald-600 hover:underline">← Back to product overview</a>
          </p>
        </div>
      </form>
    </div>
  );
}
