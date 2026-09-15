"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { acceptPartnerInvite } from "@/lib/api";
import { useBrand } from "@/components/brand-provider";
import { LoqioLogo } from "@/components/logo";

function AcceptPartnerInviteForm() {
  const router = useRouter();
  const brand = useBrand();
  const token = useSearchParams().get("token") ?? "";
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) { setError("Missing invite token — use the link from your invite message."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      await acceptPartnerInvite({ token, password, name });
      router.push("/partner");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept invite");
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
        <p className="mb-4 text-center text-sm text-zinc-500">Join the partner team</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500">Your name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="Jane Doe" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Set a password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="At least 8 characters" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
            {loading ? "Joining…" : "Accept invite & join"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AcceptPartnerInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptPartnerInviteForm />
    </Suspense>
  );
}
