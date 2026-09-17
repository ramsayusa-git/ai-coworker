import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { signPayload, WEBHOOK_EVENTS } from "../src/events.js";

describe("outbound webhook signatures", () => {
  it("signs timestamp.body with HMAC-SHA256 so a receiver can verify independently", () => {
    const secret = "whsec_test";
    const body = JSON.stringify({ event: "message.sent", data: { id: 1 } });
    const ts = 1758000000;
    // Computed here the way a customer's own receiver would, not by calling our code.
    const expected = crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    expect(signPayload(secret, body, ts)).toBe(expected);
  });

  it("changes the signature when the body or the timestamp changes (replay protection)", () => {
    const s = "whsec_test";
    const a = signPayload(s, "{}", 1);
    expect(signPayload(s, "{}", 2)).not.toBe(a);   // different timestamp
    expect(signPayload(s, "{ }", 1)).not.toBe(a);  // different body
    expect(signPayload("other", "{}", 1)).not.toBe(a); // different secret
  });

  it("publishes a stable event list for customers to subscribe to", () => {
    expect(WEBHOOK_EVENTS).toContain("message.received");
    expect(WEBHOOK_EVENTS).toContain("message.sent");
    expect(WEBHOOK_EVENTS).toContain("flow.response");
    expect(new Set(WEBHOOK_EVENTS).size).toBe(WEBHOOK_EVENTS.length);
  });
});
