import { describe, it, expect } from "vitest";
import { categoryFor, rupees, MILLI } from "../src/billing.js";

describe("conversation categories", () => {
  it("maps Meta template categories onto billing categories", () => {
    expect(categoryFor("MARKETING")).toBe("marketing");
    expect(categoryFor("marketing")).toBe("marketing");
    expect(categoryFor("UTILITY")).toBe("utility");
    expect(categoryFor("AUTHENTICATION")).toBe("authentication");
  });

  it("treats a free-form reply (no template) as a service conversation", () => {
    expect(categoryFor(null)).toBe("service");
    expect(categoryFor(undefined)).toBe("service");
    expect(categoryFor("SOMETHING_NEW")).toBe("service");
  });
});

describe("money conversion", () => {
  it("converts milli-paise to rupees at Meta's published precision", () => {
    // India marketing = Rs 0.865 = 86.5 paise = 86500 milli-paise
    expect(rupees(86500)).toBeCloseTo(0.865, 6);
    expect(rupees(11500)).toBeCloseTo(0.115, 6);
    expect(MILLI).toBe(1000);
  });
});
