"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CannedResponse, Conversation, ConversationNote, ConvStatus, Message, OrgMember } from "@/lib/types";
import { apiFetch } from "@/lib/api";
import { useResizableWidth } from "@/lib/use-resizable-width";
import { useResizableHeight } from "@/lib/use-resizable-height";

const statusIcon: Record<Message["status"], string> = { sent: "✓", delivered: "✓✓", read: "✓✓", failed: "!" };
const statuses: ConvStatus[] = ["open", "pending", "snoozed", "resolved"];

function windowLabel(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { text: "24h window closed — template required", ok: false };
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return { text: `Service window open · ${h}h ${m}m left`, ok: true };
}

export function Thread({
  conversation, messages, onSend, sending, members, notes, canned, onAssign, onStatusChange, onAddNote, onTagsChange, onTogglePin,
}: {
  conversation: Conversation; messages: Message[]; onSend: (body: string) => Promise<void>; sending: boolean;
  members: OrgMember[]; notes: ConversationNote[]; canned?: CannedResponse[];
  onAssign: (assigneeId: string | null) => void;
  onStatusChange: (status: ConvStatus) => void;
  onAddNote: (body: string) => Promise<void>;
  onTagsChange: (tags: string[]) => void;
  onTogglePin?: () => void;
}) {
  const [draft, setDraft] = useState("");
  // "/" canned-response autocomplete: static, agent-authored snippets shared org-wide —
  // separate from the AI-drafted "Suggest reply" above (no LLM call, instant, exact text).
  const slashQuery = /^\/(\S*)$/.exec(draft.trim())?.[1] ?? null;
  const cannedMatches = useMemo(() => {
    if (slashQuery === null || !canned?.length) return [];
    return canned.filter((c) => c.shortcut.startsWith(slashQuery.toLowerCase())).slice(0, 6);
  }, [slashQuery, canned]);
  const [showDetails, setShowDetails] = useState(true);
  const [notesOpen, setNotesOpen] = useState(true);
  const { width: detailsWidth, startDrag: startDetailsDrag } = useResizableWidth("thread_details_width", { min: 220, max: 460, default: 288, edge: "left" });
  const { height: notesHeight, startDrag: startNotesDrag } = useResizableHeight("thread_notes_height", { min: 80, max: 320, default: 160, edge: "top" });
  const [noteDraft, setNoteDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);
  const win = windowLabel(conversation.serviceWindowExpiresAt);

  async function submit() {
    if (!draft.trim() || sending) return;
    const b = draft; setDraft("");
    await onSend(b);
  }

  async function suggestReply() {
    setDrafting(true);
    setDraftError(null);
    try {
      const { draft: suggestion } = await apiFetch(`/conversations/${conversation.id}/draft-reply`, { method: "POST" });
      setDraft(suggestion);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Could not get a suggestion";
      const jsonPart = raw.slice(raw.indexOf("{"));
      try { setDraftError(JSON.parse(jsonPart).message ?? raw); } catch { setDraftError(raw); }
    } finally {
      setDrafting(false);
    }
  }

  function addTag() {
    const t = tagDraft.trim();
    if (!t || conversation.contact.tags.includes(t)) { setTagDraft(""); return; }
    onTagsChange([...conversation.contact.tags, t]);
    setTagDraft("");
  }

  return (
    <div className="flex h-full flex-1">
      <div className="flex h-full flex-1 flex-col bg-zinc-50">
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-3">
          <div className="flex items-center gap-2">
            {onTogglePin && (
              <button onClick={onTogglePin} title={conversation.pinned ? "Unpin" : "Pin to top of inbox"}
                className={`rounded p-1 text-base leading-none ${conversation.pinned ? "text-amber-500" : "text-zinc-300 hover:text-zinc-500"}`}>
                📌
              </button>
            )}
            <div>
              <div className="font-medium">{conversation.contact.name}</div>
              <div className="text-xs text-zinc-500">{conversation.contact.phone} · {conversation.channel.name}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select value={conversation.status} onChange={(e) => onStatusChange(e.target.value as ConvStatus)}
              className="rounded bg-zinc-800 px-2 py-1 text-xs capitalize text-white">
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={() => setShowDetails((v) => !v)}
              className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100">
              {showDetails ? "Hide details" : "Details"}
            </button>
          </div>
        </header>
        <div className={`px-5 py-1 text-xs ${win.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{win.text}</div>
        <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm shadow-sm ${m.direction === "out" ? "bg-emerald-600 text-white" : "bg-white text-zinc-900"}`}>
                <div>{m.body}</div>
                <div className={`mt-1 text-right text-[10px] ${m.direction === "out" ? "text-emerald-100" : "text-zinc-400"}`}>
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {m.direction === "out" && <span className={`ml-1 ${m.status === "read" ? "text-sky-200" : ""}`}>{statusIcon[m.status]}</span>}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottom} />
        </div>
        <div className="border-t border-zinc-200 bg-white p-3">
          <div className="mb-2 flex items-center gap-2">
            <button onClick={suggestReply} disabled={drafting || !win.ok}
              className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-40">
              {drafting ? "Thinking…" : "✨ Suggest reply"}
            </button>
            {draftError && <span className="text-[11px] text-zinc-400">{draftError}</span>}
          </div>
          <div className="relative flex gap-2">
            {cannedMatches.length > 0 && (
              <div className="absolute bottom-full left-0 mb-1 w-72 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg">
                {cannedMatches.map((c) => (
                  <button key={c.id} onClick={() => setDraft(c.body)}
                    className="block w-full border-b border-zinc-100 px-3 py-2 text-left text-xs last:border-0 hover:bg-zinc-50">
                    <span className="font-mono font-medium text-emerald-700">/{c.shortcut}</span>
                    <span className="ml-2 text-zinc-500">{c.body.length > 60 ? c.body.slice(0, 60) + "…" : c.body}</span>
                  </button>
                ))}
              </div>
            )}
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder={win.ok ? "Type a message… or / for canned responses (Enter to send, Shift+Enter for newline)" : "Window closed — choose a template"}
              disabled={!win.ok}
              className="flex-1 resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none disabled:bg-zinc-100" />
            <button onClick={submit} disabled={!win.ok || sending || !draft.trim()}
              className="rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40">
              {sending ? "…" : "Send"}
            </button>
          </div>
        </div>
      </div>

      {showDetails && (
        <div style={{ width: detailsWidth }} className="relative flex h-full shrink-0 flex-col overflow-y-auto border-l border-zinc-200 bg-white p-4">
          <div onPointerDown={startDetailsDrag} title="Drag to resize"
            className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-emerald-200/60" />
          <div className="mb-4">
            <div className="mb-1 text-xs font-semibold uppercase text-zinc-400">Assigned to</div>
            <select value={conversation.assigneeId ?? ""} onChange={(e) => onAssign(e.target.value || null)}
              className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm">
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.userId} value={m.userId}>{m.name ?? m.email}</option>)}
            </select>
          </div>

          <div className="mb-4">
            <div className="mb-1 text-xs font-semibold uppercase text-zinc-400">Contact</div>
            <div className="text-sm">{conversation.contact.name}</div>
            <div className="text-xs text-zinc-500">{conversation.contact.phone}</div>
          </div>

          <div className="mb-4">
            <div className="mb-1 text-xs font-semibold uppercase text-zinc-400">Tags</div>
            <div className="mb-2 flex flex-wrap gap-1">
              {conversation.contact.tags.map((t) => (
                <span key={t} className="flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-[11px] text-violet-700">
                  {t}
                  <button onClick={() => onTagsChange(conversation.contact.tags.filter((x) => x !== t))} className="text-violet-400 hover:text-violet-700">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-1">
              <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="Add tag…" className="flex-1 rounded border border-zinc-300 px-2 py-1 text-xs" />
              <button onClick={addTag} className="rounded border border-zinc-300 px-2 text-xs hover:bg-zinc-100">Add</button>
            </div>
          </div>

          <div className="mt-auto border-t border-zinc-100 pt-3">
            <button onClick={() => setNotesOpen((v) => !v)}
              className="mb-1 flex w-full items-center justify-between text-xs font-semibold uppercase text-zinc-400 hover:text-zinc-600">
              <span>Internal notes {notes.length > 0 && `(${notes.length})`}</span>
              <span className="text-[10px]">{notesOpen ? "▾ fold" : "▸ unfold"}</span>
            </button>
            {notesOpen && (
              <>
                <div className="mb-2 text-[11px] text-zinc-400">Only visible to your team, never sent to the customer.</div>
                <div onPointerDown={startNotesDrag} title="Drag to resize"
                  className="mb-1 h-1.5 cursor-row-resize rounded bg-zinc-100 hover:bg-emerald-200/60" />
                <div style={{ height: notesHeight }} className="mb-2 space-y-2 overflow-y-auto">
                  {notes.length === 0 && <div className="text-xs text-zinc-400">No notes yet.</div>}
                  {notes.map((n) => (
                    <div key={n.id} className="rounded bg-amber-50 p-2 text-xs text-amber-900">
                      <div>{n.body}</div>
                      <div className="mt-1 text-[10px] text-amber-600">{n.authorName ?? "Agent"} · {new Date(n.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                  ))}
                </div>
                <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} rows={2}
                  placeholder="Leave a note for the team…"
                  className="w-full resize-none rounded border border-zinc-300 px-2 py-1.5 text-xs focus:border-amber-400 focus:outline-none" />
                <button
                  onClick={async () => { if (!noteDraft.trim()) return; await onAddNote(noteDraft.trim()); setNoteDraft(""); }}
                  className="mt-1 w-full rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white hover:bg-amber-600">
                  Add note
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
