import type { ChannelAdapter, NormalizedInboundMessage, SendResult } from "./types.js";

// Meta Cloud API (Tech Provider model). Requires credentials.accessToken and
// credentials.phoneNumberId — from Embedded Signup / the Meta developer console.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
export const metaAdapter: ChannelAdapter = {
  async sendText(credentials, toPhoneE164, body): Promise<SendResult> {
    const { accessToken, phoneNumberId } = credentials;
    if (!accessToken || !phoneNumberId) {
      throw new Error("Meta channel is missing accessToken/phoneNumberId credentials — connect it in Settings first");
    }
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toPhoneE164.replace(/^\+/, ""),
        type: "text",
        text: { body },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Meta send failed: ${data?.error?.message ?? res.statusText}`);
    }
    return { providerMsgId: data.messages?.[0]?.id ?? "unknown" };
  },

  parseWebhook(payload): NormalizedInboundMessage[] {
    const out: NormalizedInboundMessage[] = [];
    const entries = (payload as any)?.entry ?? [];
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        const contactsByWaId = new Map<string, string | undefined>(
          (value.contacts ?? []).map((c: any) => [c.wa_id as string, c.profile?.name as string | undefined])
        );
        for (const msg of value.messages ?? []) {
          if (msg.type !== "text") continue;
          out.push({
            externalContactId: msg.from,
            phoneE164: `+${msg.from}`,
            contactName: contactsByWaId.get(msg.from),
            body: msg.text?.body ?? "",
            providerMsgId: msg.id,
          });
        }
      }
    }
    return out;
  },
};
