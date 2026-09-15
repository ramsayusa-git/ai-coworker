"use client";
import { useCallback, useEffect, useState } from "react";
import type { CannedResponse, Conversation, ConversationNote, ConvStatus, Message, OrgMember, SavedView, Team } from "@/lib/types";
import { ConversationList, type AssignFilter } from "./conversation-list";
import { Thread } from "./thread";
import { apiFetch } from "@/lib/api";

function withTags(c: Conversation): Conversation {
  return { ...c, contact: { ...c.contact, tags: c.contact.tags ?? [] } };
}

export function InboxView() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<ConvStatus | "all">("all");
  const [assignFilter, setAssignFilter] = useState<AssignFilter>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [views, setViews] = useState<SavedView[]>([]);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [notes, setNotes] = useState<ConversationNote[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [canned, setCanned] = useState<CannedResponse[]>([]);
  const [sending, setSending] = useState(false);

  const loadConvs = useCallback(async () => {
    const rows: Conversation[] = await apiFetch("/conversations");
    setConvs(rows.map(withTags));
  }, []);

  const loadViews = useCallback(async () => {
    const rows: SavedView[] = await apiFetch("/saved-views");
    setViews(rows);
  }, []);

  useEffect(() => { loadConvs(); }, [loadConvs]);
  useEffect(() => { loadViews(); }, [loadViews]);
  useEffect(() => { apiFetch("/members").then(setMembers).catch(() => setMembers([])); }, []);
  useEffect(() => { apiFetch("/teams").then(setTeams).catch(() => setTeams([])); }, []);
  useEffect(() => { apiFetch("/canned-responses").then(setCanned).catch(() => setCanned([])); }, []);

  useEffect(() => {
    if (!selected) { setNotes([]); return; }
    let alive = true;
    apiFetch(`/conversations/${selected}/messages`).then((d) => { if (alive) setMsgs(d); });
    apiFetch(`/conversations/${selected}/notes`).then((d) => { if (alive) setNotes(d); }).catch(() => setNotes([]));
    return () => { alive = false; };
  }, [selected]);

  // templateId is set when the agent picks an approved template from the composer — the
  // API then sends it with its interactive components (buttons / list / catalogue / flow)
  // intact, rather than flattening it to text.
  async function send(body: string, templateId?: string) {
    if (!selected) return;
    setSending(true);
    try {
      const m: Message = await apiFetch(`/conversations/${selected}/messages`, {
        method: "POST", body: JSON.stringify(templateId ? { templateId } : { body }),
      });
      setMsgs((prev) => [...prev, m]);
      await loadConvs();
    } finally { setSending(false); }
  }

  async function assign(assigneeId: string | null) {
    if (!selected) return;
    await apiFetch(`/conversations/${selected}`, { method: "PATCH", body: JSON.stringify({ assigneeId }) });
    await loadConvs();
  }

  async function assignTeam(assignedTeamId: string | null) {
    if (!selected) return;
    await apiFetch(`/conversations/${selected}`, { method: "PATCH", body: JSON.stringify({ assignedTeamId }) });
    await loadConvs();
  }

  async function changeStatus(status: ConvStatus) {
    if (!selected) return;
    await apiFetch(`/conversations/${selected}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await loadConvs();
  }

  async function addNote(body: string) {
    if (!selected) return;
    const n: ConversationNote = await apiFetch(`/conversations/${selected}/notes`, {
      method: "POST", body: JSON.stringify({ body }),
    });
    setNotes((prev) => [...prev, n]);
  }

  async function togglePin() {
    if (!current) return;
    await apiFetch(`/conversations/${current.id}`, { method: "PATCH", body: JSON.stringify({ pinned: !current.pinned }) });
    await loadConvs();
  }

  async function changeTags(tags: string[]) {
    if (!current) return;
    await apiFetch(`/contacts/${current.contact.id}`, { method: "PATCH", body: JSON.stringify({ tags }) });
    await loadConvs();
  }

  function applyView(v: SavedView) {
    setFilter((v.filters.status as ConvStatus | "all") ?? "all");
    setAssignFilter((v.filters.assignFilter as AssignFilter) ?? "all");
    setTagFilter(v.filters.tag ?? null);
  }

  async function saveView(name: string) {
    await apiFetch("/saved-views", {
      method: "POST",
      body: JSON.stringify({ name, filters: { status: filter, assignFilter, tag: tagFilter ?? undefined } }),
    });
    await loadViews();
  }

  async function deleteView(id: string) {
    await apiFetch(`/saved-views/${id}`, { method: "DELETE" });
    await loadViews();
  }

  const current = convs.find((c) => c.id === selected) ?? null;

  return (
    <div className="-m-6 flex h-screen">
      <ConversationList
        items={convs} selectedId={selected}
        filter={filter} assignFilter={assignFilter} tagFilter={tagFilter}
        onFilter={setFilter} onAssignFilter={setAssignFilter} onTagFilter={setTagFilter}
        onSelect={setSelected}
        views={views} onApplyView={applyView} onSaveView={saveView} onDeleteView={deleteView}
      />
      {current ? (
        <Thread conversation={current} messages={msgs} onSend={send} sending={sending}
          members={members} teams={teams} notes={notes} canned={canned}
          onAssign={assign} onAssignTeam={assignTeam} onStatusChange={changeStatus} onAddNote={addNote} onTagsChange={changeTags} onTogglePin={togglePin} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">Select a conversation</div>
      )}
    </div>
  );
}
