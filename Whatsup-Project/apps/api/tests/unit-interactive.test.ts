import { describe, it, expect } from "vitest";
import { buildMetaInteractive } from "../src/adapters/meta.js";

// These assert the exact shape Meta's Cloud API expects — the payload is the contract,
// so a refactor that quietly changes it should fail here rather than at send time.
describe("Meta interactive payloads", () => {
  it("builds a quick-reply button message", () => {
    const p = buildMetaInteractive({
      type: "buttons", body: "Pick one", headerType: "text", headerText: "Speed Carz", footer: "Reply anytime",
      buttons: [
        { kind: "quick_reply", text: "Test Drive", payload: "td" },
        { kind: "quick_reply", text: "Calculate EMI", payload: "emi" },
      ],
    }) as any;
    expect(p.type).toBe("button");
    expect(p.header).toEqual({ type: "text", text: "Speed Carz" });
    expect(p.footer).toEqual({ text: "Reply anytime" });
    expect(p.action.buttons).toHaveLength(2);
    expect(p.action.buttons[0]).toEqual({ type: "reply", reply: { id: "td", title: "Test Drive" } });
  });

  it("truncates button labels to WhatsApp's 20-character limit", () => {
    const p = buildMetaInteractive({
      type: "buttons", body: "x",
      buttons: [{ kind: "quick_reply", text: "A very long button label indeed" }],
    }) as any;
    expect(p.action.buttons[0].reply.title.length).toBeLessThanOrEqual(20);
  });

  it("uses cta_url for a lone URL button", () => {
    const p = buildMetaInteractive({
      type: "buttons", body: "Visit us",
      buttons: [{ kind: "url", text: "Go to website", url: "https://example.com" }],
    }) as any;
    expect(p.type).toBe("cta_url");
    expect(p.action.parameters).toEqual({ display_text: "Go to website", url: "https://example.com" });
  });

  it("builds a list message with sections and rows", () => {
    const p = buildMetaInteractive({
      type: "list", body: "Choose", listButtonText: "Main menu",
      listSections: [{ title: "Cars", rows: [{ id: "baleno", title: "Baleno", description: "Hatchback" }] }],
    }) as any;
    expect(p.type).toBe("list");
    expect(p.action.button).toBe("Main menu");
    expect(p.action.sections[0].rows[0]).toEqual({ id: "baleno", title: "Baleno", description: "Hatchback" });
  });

  it("sends a single product as `product` and several as `product_list`", () => {
    const one = buildMetaInteractive({
      type: "catalog", body: "This one", catalogId: "cat1",
      catalogSections: [{ title: "Cars", productRetailerIds: ["sku1"] }],
    }) as any;
    expect(one.type).toBe("product");
    expect(one.action).toEqual({ catalog_id: "cat1", product_retailer_id: "sku1" });

    const many = buildMetaInteractive({
      type: "catalog", body: "Browse", catalogId: "cat1",
      catalogSections: [{ title: "Cars", productRetailerIds: ["sku1", "sku2"] }],
    }) as any;
    expect(many.type).toBe("product_list");
    expect(many.action.sections[0].product_items).toHaveLength(2);
  });

  it("builds a flow message with the version-3 parameters Meta requires", () => {
    const p = buildMetaInteractive({
      type: "flow", body: "Book now", metaFlowId: "123", flowCtaText: "Book a Service", flowToken: "tok",
    }) as any;
    expect(p.type).toBe("flow");
    expect(p.action.parameters.flow_message_version).toBe("3");
    expect(p.action.parameters.flow_id).toBe("123");
    expect(p.action.parameters.flow_cta).toBe("Book a Service");
    expect(p.action.parameters.flow_token).toBe("tok");
  });
});
