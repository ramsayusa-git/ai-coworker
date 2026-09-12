export type SendResult = { providerMsgId: string };

export type NormalizedInboundMessage = {
  externalContactId: string; // wa_id / phone
  phoneE164: string;
  contactName?: string;
  body: string;
  providerMsgId: string;
};

export interface ChannelAdapter {
  // Send a free-form text message. Throws on failure — caller marks the message "failed".
  sendText(credentials: Record<string, string>, toPhoneE164: string, body: string): Promise<SendResult>;
  // Parse a provider webhook payload into normalized inbound events. Returns [] if nothing to process
  // (status callbacks, non-message events, or a signature/verify-token mismatch).
  parseWebhook(payload: unknown, credentials: Record<string, string>): NormalizedInboundMessage[];
}
