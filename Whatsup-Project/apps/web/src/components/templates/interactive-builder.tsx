"use client";
import type { CatalogSection, Flow, InteractiveType, ListSection, TemplateButton } from "@/lib/types";

export type InteractiveDraft = {
  headerType: "none" | "text" | "image" | "video" | "document";
  headerText: string;
  headerMediaUrl: string;
  footer: string;
  interactiveType: InteractiveType;
  buttons: TemplateButton[];
  listButtonText: string;
  listSections: ListSection[];
  catalogId: string;
  catalogSections: CatalogSection[];
  flowId: string;
  flowCtaText: string;
};

export const emptyInteractive: InteractiveDraft = {
  headerType: "none", headerText: "", headerMediaUrl: "", footer: "",
  interactiveType: "none", buttons: [], listButtonText: "Select",
  listSections: [{ title: "Options", rows: [] }],
  catalogId: "", catalogSections: [{ title: "Products", productRetailerIds: [] }],
  flowId: "", flowCtaText: "Open",
};

const input = "w-full rounded-md border border-zinc-300 px-2 py-1 text-sm";
const label = "block text-xs text-zinc-500";

// WhatsApp's own component limits, surfaced in the UI rather than only at save time.
const LIMITS = { quickReply: 3, url: 2, phone: 1, listRows: 10 };

export function InteractiveBuilder({
  value, onChange, flows = [],
}: { value: InteractiveDraft; onChange: (v: InteractiveDraft) => void; flows?: Flow[] }) {
  const set = (patch: Partial<InteractiveDraft>) => onChange({ ...value, ...patch });
  const counts = {
    quick_reply: value.buttons.filter((b) => b.kind === "quick_reply").length,
    url: value.buttons.filter((b) => b.kind === "url").length,
    phone: value.buttons.filter((b) => b.kind === "phone").length,
  };
  const listRows = value.listSections.reduce((n, s) => n + s.rows.length, 0);

  function addButton(kind: TemplateButton["kind"]) {
    const max = kind === "quick_reply" ? LIMITS.quickReply : kind === "url" ? LIMITS.url : LIMITS.phone;
    if (counts[kind] >= max) return;
    set({ buttons: [...value.buttons, { kind, text: "", ...(kind === "url" ? { url: "" } : {}), ...(kind === "phone" ? { phone: "" } : {}) }] });
  }
  function patchButton(i: number, patch: Partial<TemplateButton>) {
    set({ buttons: value.buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) });
  }

  return (
    <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50/60 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={label}>Header</label>
          <select value={value.headerType} onChange={(e) => set({ headerType: e.target.value as InteractiveDraft["headerType"] })} className={input}>
            <option value="none">None</option>
            <option value="text">Text</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="document">Document</option>
          </select>
        </div>
        <div>
          <label className={label}>Footer (small grey line)</label>
          <input value={value.footer} onChange={(e) => set({ footer: e.target.value })} className={input} placeholder="Reply anytime" />
        </div>
      </div>
      {value.headerType === "text" && (
        <input value={value.headerText} onChange={(e) => set({ headerText: e.target.value })} className={input} placeholder="Header text" />
      )}
      {["image", "video", "document"].includes(value.headerType) && (
        <input value={value.headerMediaUrl} onChange={(e) => set({ headerMediaUrl: e.target.value })} className={input} placeholder="https://… public media URL" />
      )}

      <div>
        <label className={label}>Interactive type</label>
        <div className="mt-1 flex flex-wrap gap-1">
          {([
            ["none", "Plain text"], ["buttons", "Buttons"], ["list", "List message"],
            ["catalog", "Catalogue"], ["flow", "WhatsApp Flow"],
          ] as const).map(([v, labelText]) => (
            <button key={v} type="button" onClick={() => set({ interactiveType: v })}
              className={`rounded-full px-3 py-1 text-xs ${value.interactiveType === v ? "bg-emerald-600 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100"}`}>
              {labelText}
            </button>
          ))}
        </div>
      </div>

      {value.interactiveType === "buttons" && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1 text-xs">
            <button type="button" onClick={() => addButton("quick_reply")} disabled={counts.quick_reply >= LIMITS.quickReply}
              className="rounded-md bg-white px-2 py-1 ring-1 ring-zinc-200 disabled:opacity-40">
              + Quick reply ({counts.quick_reply}/{LIMITS.quickReply})
            </button>
            <button type="button" onClick={() => addButton("url")} disabled={counts.url >= LIMITS.url}
              className="rounded-md bg-white px-2 py-1 ring-1 ring-zinc-200 disabled:opacity-40">
              + Website button ({counts.url}/{LIMITS.url})
            </button>
            <button type="button" onClick={() => addButton("phone")} disabled={counts.phone >= LIMITS.phone}
              className="rounded-md bg-white px-2 py-1 ring-1 ring-zinc-200 disabled:opacity-40">
              + Call button ({counts.phone}/{LIMITS.phone})
            </button>
          </div>
          {value.buttons.map((b, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1 rounded-md bg-white p-2 ring-1 ring-zinc-200">
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500">
                {b.kind === "quick_reply" ? "reply" : b.kind}
              </span>
              <input value={b.text} maxLength={20} onChange={(e) => patchButton(i, { text: e.target.value })}
                className="flex-1 rounded border border-zinc-200 px-2 py-1 text-sm" placeholder="Button label (max 20)" />
              {b.kind === "url" && (
                <input value={b.url ?? ""} onChange={(e) => patchButton(i, { url: e.target.value })}
                  className="flex-1 rounded border border-zinc-200 px-2 py-1 text-sm" placeholder="https://example.com" />
              )}
              {b.kind === "phone" && (
                <input value={b.phone ?? ""} onChange={(e) => patchButton(i, { phone: e.target.value })}
                  className="flex-1 rounded border border-zinc-200 px-2 py-1 text-sm" placeholder="+919997774255" />
              )}
              <button type="button" onClick={() => set({ buttons: value.buttons.filter((_, idx) => idx !== i) })}
                className="px-1 text-xs text-zinc-400 hover:text-red-600">✕</button>
            </div>
          ))}
          <p className="text-[11px] text-zinc-400">
            Quick replies send the customer&apos;s tap back to your inbox and can trigger automations. Website and call
            buttons open a link or dialler and never reach the inbox.
          </p>
        </div>
      )}

      {value.interactiveType === "list" && (
        <div className="space-y-2">
          <div>
            <label className={label}>List opener button ({listRows}/{LIMITS.listRows} rows used)</label>
            <input value={value.listButtonText} onChange={(e) => set({ listButtonText: e.target.value })} className={input} placeholder="Main menu" />
          </div>
          {value.listSections.map((section, si) => (
            <div key={si} className="rounded-md bg-white p-2 ring-1 ring-zinc-200">
              <div className="flex items-center gap-1">
                <input value={section.title}
                  onChange={(e) => set({ listSections: value.listSections.map((s, i) => i === si ? { ...s, title: e.target.value } : s) })}
                  className="flex-1 rounded border border-zinc-200 px-2 py-1 text-sm font-medium" placeholder="Section title" />
                {value.listSections.length > 1 && (
                  <button type="button" onClick={() => set({ listSections: value.listSections.filter((_, i) => i !== si) })}
                    className="px-1 text-xs text-zinc-400 hover:text-red-600">✕</button>
                )}
              </div>
              {section.rows.map((row, ri) => (
                <div key={ri} className="mt-1 flex items-center gap-1">
                  <input value={row.title}
                    onChange={(e) => set({
                      listSections: value.listSections.map((s, i) => i === si
                        ? { ...s, rows: s.rows.map((r, j) => j === ri ? { ...r, title: e.target.value, id: r.id || `row_${si}_${ri}` } : r) } : s),
                    })}
                    className="flex-1 rounded border border-zinc-200 px-2 py-1 text-sm" placeholder="Row title" />
                  <input value={row.description ?? ""}
                    onChange={(e) => set({
                      listSections: value.listSections.map((s, i) => i === si
                        ? { ...s, rows: s.rows.map((r, j) => j === ri ? { ...r, description: e.target.value } : r) } : s),
                    })}
                    className="flex-1 rounded border border-zinc-200 px-2 py-1 text-sm" placeholder="Description (optional)" />
                  <button type="button"
                    onClick={() => set({ listSections: value.listSections.map((s, i) => i === si ? { ...s, rows: s.rows.filter((_, j) => j !== ri) } : s) })}
                    className="px-1 text-xs text-zinc-400 hover:text-red-600">✕</button>
                </div>
              ))}
              <button type="button" disabled={listRows >= LIMITS.listRows}
                onClick={() => set({
                  listSections: value.listSections.map((s, i) => i === si
                    ? { ...s, rows: [...s.rows, { id: `row_${si}_${s.rows.length}`, title: "" }] } : s),
                })}
                className="mt-1 text-xs text-emerald-700 disabled:opacity-40">+ Add row</button>
            </div>
          ))}
          <button type="button" onClick={() => set({ listSections: [...value.listSections, { title: "", rows: [] }] })}
            className="text-xs text-emerald-700">+ Add section</button>
        </div>
      )}

      {value.interactiveType === "catalog" && (
        <div className="space-y-2">
          <div>
            <label className={label}>Meta catalogue ID</label>
            <input value={value.catalogId} onChange={(e) => set({ catalogId: e.target.value })} className={input} placeholder="from Commerce Manager" />
          </div>
          {value.catalogSections.map((section, si) => (
            <div key={si} className="rounded-md bg-white p-2 ring-1 ring-zinc-200">
              <input value={section.title}
                onChange={(e) => set({ catalogSections: value.catalogSections.map((s, i) => i === si ? { ...s, title: e.target.value } : s) })}
                className="w-full rounded border border-zinc-200 px-2 py-1 text-sm font-medium" placeholder="Section title (e.g. Cars)" />
              <textarea rows={2} value={section.productRetailerIds.join(", ")}
                onChange={(e) => set({
                  catalogSections: value.catalogSections.map((s, i) => i === si
                    ? { ...s, productRetailerIds: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } : s),
                })}
                className="mt-1 w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                placeholder="Product retailer IDs, comma separated — baleno, ciaz, ertiga" />
            </div>
          ))}
          <button type="button" onClick={() => set({ catalogSections: [...value.catalogSections, { title: "", productRetailerIds: [] }] })}
            className="text-xs text-emerald-700">+ Add section</button>
          <p className="text-[11px] text-zinc-400">
            One product sends a single product card; more than one sends a &quot;Browse catalogue&quot; multi-product message.
          </p>
        </div>
      )}

      {value.interactiveType === "flow" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className={label}>Published Flow</label>
            <select value={value.flowId} onChange={(e) => set({ flowId: e.target.value })} className={input}>
              <option value="">Select a flow…</option>
              {flows.map((f) => (
                <option key={f.id} value={f.id} disabled={f.status !== "published"}>
                  {f.name}{f.status !== "published" ? " (not published)" : ""}
                </option>
              ))}
            </select>
            {flows.length === 0 && <p className="mt-1 text-[11px] text-amber-600">No flows yet — build one under Flows first.</p>}
          </div>
          <div>
            <label className={label}>CTA label</label>
            <input value={value.flowCtaText} onChange={(e) => set({ flowCtaText: e.target.value })} className={input} placeholder="Book a Service" />
          </div>
        </div>
      )}
    </div>
  );
}
