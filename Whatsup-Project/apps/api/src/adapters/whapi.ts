import type { ChannelAdapter, NormalizedInboundMessage, SendResult } from "./types.js";

// Whapi.cloud (Quick Connect / unofficial gateway). Requires credentials.apiToken
// and optionally credentials.baseUrl (defaults to the shared gateway).
// Docs: https://whapi.readme.io/reference/sendmessagetext
export const whapiAdapter: ChannelAdapter = {
  async sendText(credentials, toPhoneE164, body): Promise<SendResult> {
    const { apiToken, baseUrl } = credentials;
    if (!apiToken) {
      throw new Error("Whapi channel is missing apiToken credentials — connect it in Settings first");
    }
    const base = baseUrl || "https://gate.whapi.cloud";
    const res = await fetch(`${base}/messages/text`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
      body: JSON.stringify({ to: toPhoneE164.replace(/^\+/, ""), body }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Whapi send failed: ${data?.error?.message ?? res.statusText}`);
    }
    return { providerMsgId: data.message?.id ?? data.id ?? "unknown" };
  },

  parseWebhook(payload): NormalizedInboundMessage[] {
    const out: NormalizedInboundMessage[] = [];
    const msgs = (payload as any)?.messages ?? [];
    for (const msg of msgs) {
      if (msg.from_me) continue;
      if (msg.type !== "text") continue;
      out.push({
        externalContactId: msg.from,
        phoneE164: msg.from?.startsWith("+") ? msg.from : `+${msg.from}`,
        contactName: msg.from_name,
        body: msg.text?.body ?? "",
        providerMsgId: msg.id,
      });
    }
    return out;
  },
};
