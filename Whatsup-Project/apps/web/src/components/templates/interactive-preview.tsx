"use client";
import type { CatalogSection, InteractiveType, ListSection, TemplateButton } from "@/lib/types";

export type InteractiveSpecLike = {
  interactiveType?: InteractiveType;
  headerType?: string | null;
  headerText?: string | null;
  headerMediaUrl?: string | null;
  footer?: string | null;
  buttons?: TemplateButton[];
  listButtonText?: string | null;
  listSections?: ListSection[];
  catalogId?: string | null;
  catalogSections?: CatalogSection[];
  flowCtaText?: string | null;
};

const icon: Record<string, string> = { url: "↗", phone: "📞", quick_reply: "" };

// Renders a message bubble the way WhatsApp actually lays it out: header, body, footer,
// then the interactive footer control (buttons / list opener / catalogue / flow CTA).
// Shared by the template builder preview and the inbox thread so both show the same thing.
export function InteractiveBubble({ body, spec }: { body: string; spec: InteractiveSpecLike }) {
  const type = spec.interactiveType ?? "none";
  const buttons = spec.buttons ?? [];
  const quick = buttons.filter((b) => b.kind === "quick_reply");
  const ctas = buttons.filter((b) => b.kind !== "quick_reply");
  const rows = (spec.listSections ?? []).flatMap((s) => s.rows ?? []);
  const products = (spec.catalogSections ?? []).flatMap((s) => s.productRetailerIds ?? []);

  return (
    <div className="max-w-[300px]">
      <div className="overflow-hidden rounded-2xl rounded-tl-sm bg-white text-sm shadow-sm">
        {spec.headerType === "text" && spec.headerText && (
          <div className="px-3 pt-2 text-sm font-semibold text-zinc-900">{spec.headerText}</div>
        )}
        {spec.headerType && ["image", "video", "document"].includes(spec.headerType) && (
          <div className="flex h-24 items-center justify-center bg-zinc-100 text-xs text-zinc-400">
            {spec.headerMediaUrl
              ? (spec.headerType === "image"
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={spec.headerMediaUrl} alt="" className="h-24 w-full object-cover" />
                  : `${spec.headerType} header`)
              : `${spec.headerType} header (no URL yet)`}
          </div>
        )}
        <div className="whitespace-pre-wrap px-3 py-2 text-zinc-800">
          {body || <span className="text-zinc-400">Message body…</span>}
        </div>
        {spec.footer && <div className="px-3 pb-2 text-[11px] text-zinc-400">{spec.footer}</div>}

        {type === "list" && (
          <div className="border-t border-zinc-100 px-3 py-2 text-center text-sm font-medium text-sky-600">
            ☰ {spec.listButtonText || "Select"}
          </div>
        )}
        {type === "catalog" && (
          <div className="border-t border-zinc-100 px-3 py-2 text-center text-sm font-medium text-sky-600">
            🛍 {products.length > 1 ? "Browse Catalogue" : "View product"}
          </div>
        )}
        {type === "flow" && (
          <div className="border-t border-zinc-100 px-3 py-2 text-center text-sm font-medium text-sky-600">
            {spec.flowCtaText || "Open"}
          </div>
        )}
        {type === "buttons" && ctas.map((b, i) => (
          <div key={`cta-${i}`} className="border-t border-zinc-100 px-3 py-2 text-center text-sm font-medium text-sky-600">
            {icon[b.kind]} {b.text || "Button"}
          </div>
        ))}
      </div>

      {type === "buttons" && quick.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {quick.map((b, i) => (
            <span key={i} className="rounded-2xl bg-white px-3 py-1.5 text-xs font-medium text-sky-600 shadow-sm">
              {b.text || `Button ${i + 1}`}
            </span>
          ))}
        </div>
      )}

      {type === "list" && rows.length > 0 && (
        <div className="mt-1 rounded-xl bg-white/80 p-2 text-[11px] text-zinc-500 shadow-sm">
          <div className="mb-1 font-medium text-zinc-600">Opens a list with {rows.length} option{rows.length === 1 ? "" : "s"}:</div>
          {rows.slice(0, 5).map((r, i) => <div key={i}>• {r.title}</div>)}
          {rows.length > 5 && <div>…and {rows.length - 5} more</div>}
        </div>
      )}

      {type === "catalog" && products.length > 0 && (
        <div className="mt-1 rounded-xl bg-white/80 p-2 text-[11px] text-zinc-500 shadow-sm">
          {products.length} product{products.length === 1 ? "" : "s"} from catalogue {spec.catalogId || "—"}
        </div>
      )}
    </div>
  );
}
