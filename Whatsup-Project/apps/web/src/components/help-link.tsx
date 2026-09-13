"use client";

export const GUIDE_URL = "https://claude.ai/code/artifact/a8a37b42-da98-44fb-835e-b61f9d530343";

export function HelpLink({ anchor, label = "Help" }: { anchor: string; label?: string }) {
  return (
    <a
      href={`${GUIDE_URL}#${anchor}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open the how-to guide for this page`}
      className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
    >
      <span aria-hidden>❓</span>
      {label}
    </a>
  );
}
