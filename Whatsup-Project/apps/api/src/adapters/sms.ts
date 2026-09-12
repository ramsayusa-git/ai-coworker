// Real, pluggable SMS fallback — same honesty pattern as apps/api/src/ai.ts: if real
// gateway credentials are configured via env vars, this makes a genuine API call; if not,
// it fails clearly instead of pretending to deliver. Supports MSG91 (India-focused,
// matches this project's primary market) or Twilio, whichever is configured.
// Env vars: MSG91_AUTH_KEY + MSG91_SENDER_ID, or TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER.

export function hasSmsCredentials(): boolean {
  return !!(process.env.MSG91_AUTH_KEY && process.env.MSG91_SENDER_ID) ||
    !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

export async function sendSms(toPhoneE164: string, body: string): Promise<{ providerMsgId: string }> {
  const msg91Key = process.env.MSG91_AUTH_KEY;
  const msg91Sender = process.env.MSG91_SENDER_ID;
  if (msg91Key && msg91Sender) {
    const res = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: { authkey: msg91Key, "content-type": "application/json" },
      body: JSON.stringify({ sender: msg91Sender, mobiles: toPhoneE164.replace(/^\+/, ""), message: body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`MSG91 send failed: ${(data as any)?.message ?? res.statusText}`);
    return { providerMsgId: (data as any)?.request_id ?? "unknown" };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (sid && token && from) {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: toPhoneE164, From: from, Body: body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Twilio send failed: ${(data as any)?.message ?? res.statusText}`);
    return { providerMsgId: (data as any)?.sid ?? "unknown" };
  }

  throw new Error("No SMS gateway configured — set MSG91_AUTH_KEY/MSG91_SENDER_ID or TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER");
}
