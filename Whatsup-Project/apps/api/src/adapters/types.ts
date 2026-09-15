export type SendResult = { providerMsgId: string };

// What an outbound interactive message can be. Mirrors the Meta Cloud API's
// `interactive` object shapes one-for-one, but kept provider-neutral so Whapi (or a
// future provider) can map it to its own payload.
export type InteractiveSpec = {
  // buttons | list | catalog | flow | cta_url
  type: string;
  body: string;
  headerType?: string; // none | text | image | video | document
  headerText?: string;
  headerMediaUrl?: string;
  footer?: string;
  // type=buttons: quick replies (kind "quick_reply") and CTAs (kind "url" | "phone").
  // Meta sends quick replies as interactive/button and a single URL CTA as
  // interactive/cta_url — buildMetaInteractive() picks the right shape.
  buttons?: Array<{ kind: string; text: string; url?: string; phone?: string; payload?: string }>;
  // type=list
  listButtonText?: string;
  listSections?: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>;
  // type=catalog
  catalogId?: string;
  catalogSections?: Array<{ title: string; productRetailerIds: string[] }>;
  // type=flow
  metaFlowId?: string;
  flowCtaText?: string;
  flowToken?: string;
};

export type NormalizedInboundMessage = {
  externalContactId: string; // wa_id / phone
  phoneE164: string;
  contactName?: string;
  body: string;
  providerMsgId: string;
  // text | button_reply | list_reply | flow_reply | product — defaults to "text" for
  // every adapter that doesn't set it, so existing behaviour is unchanged.
  msgType?: string;
  // The structured reply payload (which button/row id was tapped, or the flow answers).
  interactive?: Record<string, unknown>;
};

export interface ChannelAdapter {
  // Send a free-form text message. Throws on failure — caller marks the message "failed".
  sendText(credentials: Record<string, string>, toPhoneE164: string, body: string): Promise<SendResult>;
  // Send an interactive message (buttons / list / catalogue / flow). Optional: a provider
  // that can't do interactive messages simply omits it and the caller falls back to text.
  sendInteractive?(credentials: Record<string, string>, toPhoneE164: string, spec: InteractiveSpec): Promise<SendResult>;
  // Parse a provider webhook payload into normalized inbound events. Returns [] if nothing to process
  // (status callbacks, non-message events, or a signature/verify-token mismatch).
  parseWebhook(payload: unknown, credentials: Record<string, string>): NormalizedInboundMessage[];
}
