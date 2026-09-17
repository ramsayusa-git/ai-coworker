import { describe, it, expect } from "vitest";
import { metaAdapter } from "../src/adapters/meta.js";

// Payload shapes copied from Meta's documented webhook examples.
const wrap = (messages: unknown[]) => ({
  entry: [{ changes: [{ value: {
    metadata: { phone_number_id: "PNID" },
    contacts: [{ wa_id: "919900112233", profile: { name: "Priya" } }],
    messages,
  }}]}],
});

describe("inbound Meta webhook parsing", () => {
  it("parses a plain text message", () => {
    const [m] = metaAdapter.parseWebhook(wrap([{ from: "919900112233", id: "w1", type: "text", text: { body: "hello" } }]), {});
    expect(m.body).toBe("hello");
    expect(m.msgType).toBe("text");
    expect(m.phoneE164).toBe("+919900112233");
    expect(m.contactName).toBe("Priya");
  });

  it("parses an interactive button reply", () => {
    const [m] = metaAdapter.parseWebhook(wrap([{
      from: "919900112233", id: "w2", type: "interactive",
      interactive: { type: "button_reply", button_reply: { id: "td", title: "Test Drive" } },
    }]), {});
    expect(m.msgType).toBe("button_reply");
    expect(m.body).toBe("Test Drive");
    expect(m.interactive).toEqual({ buttonId: "td", buttonText: "Test Drive" });
  });

  it("parses a list reply", () => {
    const [m] = metaAdapter.parseWebhook(wrap([{
      from: "919900112233", id: "w3", type: "interactive",
      interactive: { type: "list_reply", list_reply: { id: "emi", title: "Calculate EMI", description: "d" } },
    }]), {});
    expect(m.msgType).toBe("list_reply");
    expect(m.interactive).toMatchObject({ rowId: "emi", rowTitle: "Calculate EMI" });
  });

  it("parses a Flow submission, whose response_json is a JSON string", () => {
    const [m] = metaAdapter.parseWebhook(wrap([{
      from: "919900112233", id: "w4", type: "interactive",
      interactive: { type: "nfm_reply", nfm_reply: { body: "Sent", response_json: JSON.stringify({ flow_token: "f:1", date: "2026-09-22" }) } },
    }]), {});
    expect(m.msgType).toBe("flow_reply");
    expect((m.interactive as any).answers.date).toBe("2026-09-22");
    expect((m.interactive as any).flowToken).toBe("f:1");
  });

  it("survives malformed flow JSON instead of throwing", () => {
    const [m] = metaAdapter.parseWebhook(wrap([{
      from: "919900112233", id: "w5", type: "interactive",
      interactive: { type: "nfm_reply", nfm_reply: { response_json: "{not json" } },
    }]), {});
    expect(m.msgType).toBe("flow_reply");
    expect((m.interactive as any).answers.raw).toBe("{not json");
  });

  it("parses a template quick-reply tap, which arrives as type 'button'", () => {
    const [m] = metaAdapter.parseWebhook(wrap([{
      from: "919900112233", id: "w6", type: "button", button: { text: "Claim now", payload: "claim" },
    }]), {});
    expect(m.msgType).toBe("button_reply");
    expect(m.interactive).toEqual({ buttonId: "claim", buttonText: "Claim now" });
  });

  it("ignores status callbacks and unknown event shapes", () => {
    expect(metaAdapter.parseWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: "x", status: "read" }] } }] }] }, {})).toEqual([]);
    expect(metaAdapter.parseWebhook({}, {})).toEqual([]);
    expect(metaAdapter.parseWebhook(null, {})).toEqual([]);
  });
});
