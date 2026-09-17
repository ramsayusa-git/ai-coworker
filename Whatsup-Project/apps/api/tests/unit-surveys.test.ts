import { describe, it, expect } from "vitest";
import { parseScore } from "../src/modules/surveys.js";

// parseScore is the gate between "a customer typed something" and "we recorded a
// satisfaction score", so its edges matter more than its happy path.
describe("parseScore", () => {
  it("accepts the whole CSAT range and rejects outside it", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(parseScore(String(n), "csat")).toBe(n);
    expect(parseScore("0", "csat")).toBeNull();
    expect(parseScore("6", "csat")).toBeNull();
  });

  it("accepts the whole NPS range including zero and ten", () => {
    expect(parseScore("0", "nps")).toBe(0);
    expect(parseScore("10", "nps")).toBe(10);
    expect(parseScore("11", "nps")).toBeNull();
  });

  it("reads a leading score followed by words", () => {
    expect(parseScore("5 - great service", "csat")).toBe(5);
    expect(parseScore("  4 thanks ", "csat")).toBe(4);
  });

  it("ignores a number that is not the first token", () => {
    expect(parseScore("send me 5 boxes", "csat")).toBeNull();
    expect(parseScore("thanks!", "csat")).toBeNull();
    expect(parseScore("", "csat")).toBeNull();
  });

  it("does not read a longer number as its first digit", () => {
    // "50" must not become a 5 — the \b after the digits is what prevents it.
    expect(parseScore("50", "csat")).toBeNull();
    expect(parseScore("2026", "nps")).toBeNull();
  });
});
