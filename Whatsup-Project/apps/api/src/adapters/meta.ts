import type { ChannelAdapter, InteractiveSpec, NormalizedInboundMessage, SendResult } from "./types.js";

const GRAPH = "https://graph.facebook.com/v20.0";

async function post(credentials: Record<string, string>, body: unknown): Promise<SendResult> {
  const { accessToken, phoneNumberId } = credentials;
  if (!accessToken || !phoneNumberId) {
    throw new Error("Meta channel is missing accessToken/phoneNumberId credentials — connect it in Settings first");
  }
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Meta send failed: ${data?.error?.message ?? res.statusText}`);
  return { providerMsgId: data.messages?.[0]?.id ?? "unknown" };
}

function buildHeader(spec: InteractiveSpec) {
  if (!spec.headerType || spec.headerType === "none") return undefined;
  if (spec.headerType === "text") return spec.headerText ? { type: "text", text: spec.headerText } : undefined;
  if (!spec.headerMediaUrl) return undefined;
  return { type: spec.headerType, [spec.headerType]: { link: spec.headerMediaUrl } };
}

// Maps our provider-neutral InteractiveSpec onto Meta's `interactive` object.
// Exported so the tests/UI preview and the public API share one source of truth.
export function buildMetaInteractive(spec: InteractiveSpec): Record<string, unknown> {
  const header = buildHeader(spec);
  const base: Record<string, unknown> = {
    body: { text: spec.body },
    ...(header ? { header } : {}),
    ...(spec.footer ? { footer: { text: spec.footer } } : {}),
  };

  if (spec.type === "list") {
    return {
      ...base,
      type: "list",
      action: {
        button: spec.listButtonText || "Select",
        sections: (spec.listSections ?? []).map((s) => ({
          title: s.title,
          rows: s.rows.map((r) => ({ id: r.id, title: r.title, ...(r.description ? { description: r.description } : {}) })),
        })),
      },
    };
  }

  if (spec.type === "catalog") {
    const sections = spec.catalogSections ?? [];
    // One product = Meta's single "product" message; many = "product_list" (Browse Catalogue).
    const onlyOne = sections.length === 1 && sections[0].productRetailerIds.length === 1;
    if (onlyOne) {
      return {
        ...base,
        type: "product",
        action: { catalog_id: spec.catalogId, product_retailer_id: sections[0].productRetailerIds[0] },
      };
    }
    return {
      ...base,
      type: "product_list",
      // product_list requires a text header per Meta's schema
      header: header ?? { type: "text", text: spec.headerText || "Catalogue" },
      action: {
        catalog_id: spec.catalogId,
        sections: sections.map((s) => ({
          title: s.title,
          product_items: s.productRetailerIds.map((id) => ({ product_retailer_id: id })),
        })),
      },
    };
  }

  if (spec.type === "flow") {
    return {
      ...base,
      type: "flow",
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_id: spec.metaFlowId,
          flow_cta: spec.flowCtaText || "Open",
          flow_action: "navigate",
          ...(spec.flowToken ? { flow_token: spec.flowToken } : {}),
        },
      },
    };
  }

  const buttons = spec.buttons ?? [];
  const quickReplies = buttons.filter((b) => b.kind === "quick_reply");
  const urlButtons = buttons.filter((b) => b.kind === "url");

  // Meta has no mixed quick-reply + URL free-form interactive message: a single URL CTA
  // uses the dedicated cta_url type. Mixed sets are only possible inside an approved
  // template, which goes out through sendTemplate, not here.
  if (quickReplies.length === 0 && urlButtons.length === 1) {
    return {
      ...base,
      type: "cta_url",
      action: { name: "cta_url", parameters: { display_text: urlButtons[0].text, url: urlButtons[0].url } },
    };
  }

  return {
    ...base,
    type: "button",
    action: {
      buttons: quickReplies.slice(0, 3).map((b, i) => ({
        type: "reply",
        reply: { id: b.payload || `btn_${i + 1}`, title: b.text.slice(0, 20) },
      })),
    },
  };
}

// Meta Cloud API (Tech Provider model). Requires credentials.accessToken and
// credentials.phoneNumberId — from Embedded Signup / the Meta developer console.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
export const metaAdapter: ChannelAdapter = {
  async sendText(credentials, toPhoneE164, body) {
    return post(credentials, {
      messaging_product: "whatsapp",
      to: toPhoneE164.replace(/^\+/, ""),
      type: "text",
      text: { body },
    });
  },

  async sendInteractive(credentials, toPhoneE164, spec) {
    return post(credentials, {
      messaging_product: "whatsapp",
      to: toPhoneE164.replace(/^\+/, ""),
      type: "interactive",
      interactive: buildMetaInteractive(spec),
    });
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
          const common = {
            externalContactId: msg.from,
            phoneE164: `+${msg.from}`,
            contactName: contactsByWaId.get(msg.from),
            providerMsgId: msg.id,
          };

          if (msg.type === "text") {
            out.push({ ...common, body: msg.text?.body ?? "", msgType: "text" });
            continue;
          }

          // Template quick-reply taps arrive as type "button" (not "interactive")
          if (msg.type === "button") {
            out.push({
              ...common,
              body: msg.button?.text ?? "",
              msgType: "button_reply",
              interactive: { buttonId: msg.button?.payload, buttonText: msg.button?.text },
            });
            continue;
          }

          if (msg.type === "interactive") {
            const i = msg.interactive ?? {};
            if (i.type === "button_reply") {
              out.push({
                ...common,
                body: i.button_reply?.title ?? "",
                msgType: "button_reply",
                interactive: { buttonId: i.button_reply?.id, buttonText: i.button_reply?.title },
              });
            } else if (i.type === "list_reply") {
              out.push({
                ...common,
                body: i.list_reply?.title ?? "",
                msgType: "list_reply",
                interactive: {
                  rowId: i.list_reply?.id,
                  rowTitle: i.list_reply?.title,
                  rowDescription: i.list_reply?.description,
                },
              });
            } else if (i.type === "nfm_reply") {
              // WhatsApp Flow submission. response_json is a JSON *string* per Meta's schema.
              let answers: Record<string, unknown> = {};
              try {
                answers = JSON.parse(i.nfm_reply?.response_json ?? "{}");
              } catch {
                answers = { raw: i.nfm_reply?.response_json };
              }
              out.push({
                ...common,
                body: i.nfm_reply?.body || "Flow submitted",
                msgType: "flow_reply",
                interactive: { flowToken: (answers as any).flow_token, answers },
              });
            }
            continue;
          }

          if (msg.type === "order") {
            out.push({
              ...common,
              body: msg.order?.text || "Catalogue order",
              msgType: "product",
              interactive: { catalogId: msg.order?.catalog_id, items: msg.order?.product_items ?? [] },
            });
          }
        }
      }
    }
    return out;
  },
};
