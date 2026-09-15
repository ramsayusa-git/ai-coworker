import type { ChannelAdapter, NormalizedInboundMessage } from "./types.js";

// Facebook Messenger and Instagram Direct both run on Meta's Send API with the same
// message shape — only the page/IG account token differs. The Advanced tier's
// "Inbox: WhatsApp, Facebook, Instagram" is these two plus the existing WhatsApp inbox.
// Docs: https://developers.facebook.com/docs/messenger-platform/reference/send-api
const GRAPH = "https://graph.facebook.com/v20.0";

function makeAdapter(label: string): ChannelAdapter {
  return {
    async sendText(credentials, toPsid, body) {
      const { accessToken, pageId } = credentials;
      if (!accessToken || !pageId) {
        throw new Error(`${label} channel is missing accessToken/pageId credentials — connect it in Channels first`);
      }
      const res = await fetch(`${GRAPH}/${pageId}/messages?access_token=${encodeURIComponent(accessToken)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          // toPsid is the platform-scoped user id, which we store in contacts.waId and
          // mirror into phoneE164 as "psid:<id>" since these platforms have no phone number.
          recipient: { id: toPsid.replace(/^\+?psid:/, "") },
          messaging_type: "RESPONSE",
          message: { text: body },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`${label} send failed: ${data?.error?.message ?? res.statusText}`);
      return { providerMsgId: data.message_id ?? "unknown" };
    },

    // Messenger/IG quick replies are the closest equivalent to WhatsApp quick-reply
    // buttons; URL buttons map to a button template. Lists/catalogue/flows are
    // WhatsApp-only, so those degrade to the text body via the caller's fallback.
    async sendInteractive(credentials, toPsid, spec) {
      const { accessToken, pageId } = credentials;
      if (!accessToken || !pageId) {
        throw new Error(`${label} channel is missing accessToken/pageId credentials — connect it in Channels first`);
      }
      const quick = (spec.buttons ?? []).filter((b) => b.kind === "quick_reply");
      const urls = (spec.buttons ?? []).filter((b) => b.kind === "url");

      let message: Record<string, unknown>;
      if (urls.length) {
        message = {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text: spec.body,
              buttons: urls.slice(0, 3).map((b) => ({ type: "web_url", url: b.url, title: b.text })),
            },
          },
        };
      } else if (quick.length) {
        message = {
          text: spec.body,
          quick_replies: quick.slice(0, 13).map((b, i) => ({
            content_type: "text", title: b.text.slice(0, 20), payload: b.payload || `btn_${i + 1}`,
          })),
        };
      } else {
        message = { text: spec.body };
      }

      const res = await fetch(`${GRAPH}/${pageId}/messages?access_token=${encodeURIComponent(accessToken)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipient: { id: toPsid.replace(/^\+?psid:/, "") }, messaging_type: "RESPONSE", message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`${label} send failed: ${data?.error?.message ?? res.statusText}`);
      return { providerMsgId: data.message_id ?? "unknown" };
    },

    parseWebhook(payload): NormalizedInboundMessage[] {
      const out: NormalizedInboundMessage[] = [];
      for (const entry of (payload as any)?.entry ?? []) {
        for (const ev of entry.messaging ?? []) {
          const senderId = ev.sender?.id;
          if (!senderId || !ev.message) continue;
          if (ev.message.is_echo) continue; // our own outbound, echoed back
          const quickReply = ev.message.quick_reply?.payload;
          out.push({
            externalContactId: senderId,
            phoneE164: `psid:${senderId}`,
            body: ev.message.text ?? (ev.message.attachments?.length ? "[attachment]" : ""),
            providerMsgId: ev.message.mid ?? `${senderId}:${ev.timestamp}`,
            msgType: quickReply ? "button_reply" : "text",
            ...(quickReply ? { interactive: { buttonId: quickReply, buttonText: ev.message.text } } : {}),
          });
        }
      }
      return out;
    },
  };
}

export const messengerAdapter = makeAdapter("Messenger");
export const instagramAdapter = makeAdapter("Instagram");
