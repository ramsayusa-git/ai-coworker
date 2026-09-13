"use client";
import Link from "next/link";

export function HelpLink({ anchor, label = "Help" }: { anchor: string; label?: string }) {
  return (
    <Link
      href={`/help#${anchor}`}
      title="Open the how-to guide for this page"
      className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
    >
      <span aria-hidden>❓</span>
      {label}
    </Link>
  );
}
