"use client";
import { useCallback, useEffect, useState } from "react";
import type { Channel } from "@/lib/types";
import { apiFetch } from "@/lib/api";
import { HelpLink } from "@/components/help-link";

type ApiChannel = {
  id: string; provider: Channel["provider"]; displayName: string; phoneE164: string | null;
  status: string; qualityRating: string | null; safetyScore: number | null; warmupDay: number | null; connectedAt: string;
  credentialsSet?: boolean;
};

function fromApi(c: ApiChannel): Channel {
  return {
    id: c.id, provider: c.provider, displayName: c.displayName, phone: c.phoneE164 ?? "",
    status: c.status as Channel["status"], qualityRating: (c.qualityRating as Channel["qualityRating"]) ?? undefined,
    safetyScore: c.safetyScore ?? undefined, warmupDay: c.warmupDay ?? undefined, connectedAt: c.connectedAt,
  };
}

const qualityColor: Record<NonNullable<Channel["qualityRating"]>, string> = {
  green: "bg-emerald-500", yellow: "bg-amber-500", red: "bg-red-500",
};

function timeAgo(iso: string) {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const inputCls = "w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-500";

function ConnectModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"meta" | "whapi" | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!mode || !displayName.trim()) { setError("Display name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const credentials =
        mode === "meta" ? { accessToken: accessToken.trim(), phoneNumberId: phoneNumberId.trim() }
                         : { apiToken: apiToken.trim() };
      if (mode === "meta" && (!credentials.accessToken || !credentials.phoneNumberId)) {
        throw new Error("Access token and Phone Number ID are both required");
      }
      if (mode === "whapi" && !credentials.apiToken) {
        throw new Error("API token is required");
      }
      await apiFetch("/channels", {
        method: "POST",
        body: JSON.stringify({ provider: mode, displayName: displayName.trim(), phoneE164: phone.trim() || undefined, credentials }),
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect channel");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30">
      <div className="w-[440px] rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Connect a WhatsApp number</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">✕</button>
        </div>

        {!mode && (
          <div className="space-y-3">
            <button onClick={() => setMode("meta")}
              className="w-full rounded-lg border border-zinc-200 p-4 text-left hover:border-emerald-400 hover:bg-emerald-50">
              <div className="font-medium">Official (Meta Cloud API)</div>
              <div className="mt-1 text-xs text-zinc-500">Green-tick eligible, templates, higher throughput, no ban risk. Best for real volume — see the pros/cons note in Settings.</div>
            </button>
            <button onClick={() => setMode("whapi")}
              className="w-full rounded-lg border border-zinc-200 p-4 text-left hover:border-amber-400 hover:bg-amber-50">
              <div className="font-medium">Quick Connect (Whapi.cloud)</div>
              <div className="mt-1 text-xs text-zinc-500">Link an existing number in minutes. Faster to start, but runs on an unofficial protocol and can be banned by Meta.</div>
            </button>
          </div>
        )}

        {mode && !done && (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-zinc-600">
              Display name
              <input className={inputCls} value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                placeholder={mode === "meta" ? "Aetos Store (Official)" : "Sales line"} />
            </label>
            <label className="block text-xs font-medium text-zinc-600">
              Phone number (E.164, optional)
              <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+919000000000" />
            </label>

            {mode === "meta" ? (
              <>
                <label className="block text-xs font-medium text-zinc-600">
                  Access token
                  <input className={inputCls} type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="System-user token from Meta Business Suite" />
                </label>
                <label className="block text-xs font-medium text-zinc-600">
                  Phone Number ID
                  <input className={inputCls} value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)}
                    placeholder="From Meta developer console" />
                </label>
                <p className="text-xs text-zinc-400">
                  Get these from Meta Business Suite → WhatsApp Manager → API Setup, after completing Embedded Signup for this number.
                </p>
              </>
            ) : (
              <>
                <label className="block text-xs font-medium text-zinc-600">
                  Whapi API token
                  <input className={inputCls} type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)}
                    placeholder="From your Whapi.cloud channel dashboard" />
                </label>
                <p className="text-xs text-zinc-400">
                  Create a channel at whapi.cloud, scan the QR there to link your WhatsApp number, then paste its API token here.
                </p>
              </>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex items-center justify-between pt-1">
              <button onClick={() => setMode(null)} className="text-xs text-zinc-400 hover:underline">← Back</button>
              <button onClick={submit} disabled={saving}
                className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                {saving ? "Connecting…" : "Connect"}
              </button>
            </div>
          </div>
        )}

        {done && (
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">✓</div>
            <p className="text-sm font-medium text-emerald-700">Connected</p>
            <p className="text-center text-xs text-zinc-500">
              {mode === "meta" ? "Sending is now live via the Meta Cloud API." : "Sending is now live via Whapi.cloud. Warm up gradually to avoid a ban."}
            </p>
            <button onClick={onClose} className="mt-2 rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ChannelsView() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [showConnect, setShowConnect] = useState(false);

  const load = useCallback(async () => {
    const rows: ApiChannel[] = await apiFetch("/channels");
    setChannels(rows.map(fromApi));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Channels</h1>
        <div className="flex items-center gap-2">
          <HelpLink anchor="channels" />
          <button onClick={() => setShowConnect(true)}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
            + Connect number
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {channels.map((c) => (
          <div key={c.id} className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{c.displayName}</div>
                <div className="text-xs text-zinc-500">{c.phone}</div>
              </div>
              <span className={`rounded px-2 py-0.5 text-xs ${c.provider === "meta" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"}`}>
                {c.provider === "meta" ? "Official" : "Quick Connect"}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
              <span className={`h-2 w-2 rounded-full ${c.status === "connected" ? "bg-emerald-500" : "bg-zinc-300"}`} />
              {c.status}
              <span>· connected {timeAgo(c.connectedAt)}</span>
            </div>
            {c.provider === "meta" && c.qualityRating && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className={`h-2 w-2 rounded-full ${qualityColor[c.qualityRating]}`} />
                Quality: {c.qualityRating} · Tier {c.messageLimitTier}
              </div>
            )}
            {c.provider === "whapi" && (
              <div className="mt-2 text-xs text-zinc-500">
                Safety score {c.safetyScore} · Warm-up day {c.warmupDay}/14
              </div>
            )}
          </div>
        ))}
        {channels.length === 0 && (
          <div className="col-span-2 rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-400">
            No channels connected yet.
          </div>
        )}
      </div>

      {showConnect && <ConnectModal onClose={() => { setShowConnect(false); load(); }} />}
    </div>
  );
}
