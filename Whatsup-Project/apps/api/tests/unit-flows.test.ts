import { describe, it, expect } from "vitest";
import { compileFlowJson } from "../src/adapters/meta-flows.js";

describe("Flow JSON compilation", () => {
  const screens = [
    { id: "ONE", title: "Your details", fields: [
      { name: "full_name", label: "Name", type: "text", required: true },
      { name: "email", label: "Email", type: "email" },
    ]},
    { id: "TWO", title: "Booking", terminal: true, ctaLabel: "SEND", fields: [
      { name: "date", label: "Date", type: "date", required: true },
      { name: "model", label: "Model", type: "dropdown", options: ["Baleno", "Ertiga"] },
    ]},
  ];

  it("emits Flow JSON v5 with one screen per input screen", () => {
    const j = compileFlowJson(screens as any) as any;
    expect(j.version).toBe("5.0");
    expect(j.screens).toHaveLength(2);
    expect(j.screens[0].id).toBe("ONE");
  });

  it("maps field types onto Flow components", () => {
    const j = compileFlowJson(screens as any) as any;
    const children = j.screens[0].layout.children[0].children;
    expect(children[0].type).toBe("TextInput");
    expect(children[0]["input-type"]).toBe("text");
    expect(children[1]["input-type"]).toBe("email");
    const second = j.screens[1].layout.children[0].children;
    expect(second[0].type).toBe("DatePicker");
    expect(second[1].type).toBe("Dropdown");
    expect(second[1]["data-source"]).toEqual([
      { id: "0", title: "Baleno" }, { id: "1", title: "Ertiga" },
    ]);
  });

  it("navigates between screens and completes on the last one", () => {
    const j = compileFlowJson(screens as any) as any;
    const firstFooter = j.screens[0].layout.children[0].children.at(-1);
    expect(firstFooter.type).toBe("Footer");
    expect(firstFooter["on-click-action"].name).toBe("navigate");
    expect(firstFooter["on-click-action"].next).toEqual({ type: "screen", name: "TWO" });

    const lastFooter = j.screens[1].layout.children[0].children.at(-1);
    expect(lastFooter.label).toBe("SEND");
    expect(lastFooter["on-click-action"].name).toBe("complete");
    // Every field on the terminal screen must be in the completion payload, or the
    // answer never reaches the webhook.
    expect(Object.keys(lastFooter["on-click-action"].payload)).toEqual(["date", "model"]);
    expect(j.screens[1].terminal).toBe(true);
  });

  it("handles an empty flow without throwing", () => {
    const j = compileFlowJson([] as any) as any;
    expect(j.screens).toEqual([]);
  });
});
