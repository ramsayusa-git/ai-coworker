"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import type { Company, ContactRecord } from "@/lib/types";

export function CompanyDetailView({ companyId }: { companyId: string }) {
  const [data, setData] = useState<{ company: Company; contacts: ContactRecord[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/companies/${companyId}`).then(setData).catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [companyId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return null;
  const { company, contacts } = data;

  return (
    <div>
      <Link href="/companies" className="text-xs text-zinc-400 hover:underline">← Companies</Link>
      <h1 className="mt-1 text-2xl font-semibold">{company.name}</h1>
      <div className="mt-1 flex gap-4 text-sm text-zinc-500">
        {company.industry && <span>{company.industry}</span>}
        {company.domain && <span>{company.domain}</span>}
        {company.phone && <span>{company.phone}</span>}
      </div>
      {company.notes && <p className="mt-3 max-w-2xl text-sm text-zinc-600">{company.notes}</p>}

      <h2 className="mb-2 mt-6 text-sm font-semibold text-zinc-700">Contacts ({contacts.length})</h2>
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
            <tr><th className="px-4 py-2 font-medium">Name</th><th className="px-4 py-2 font-medium">Phone</th><th className="px-4 py-2 font-medium">Stage</th></tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-t border-zinc-100">
                <td className="px-4 py-2 font-medium">
                  <Link href={`/contacts/${c.id}`} className="text-emerald-700 hover:underline">{c.name}</Link>
                </td>
                <td className="px-4 py-2 text-zinc-600">{c.phoneE164}</td>
                <td className="px-4 py-2 text-zinc-600">{c.stage}</td>
              </tr>
            ))}
            {contacts.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-xs text-zinc-400">No contacts linked yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
