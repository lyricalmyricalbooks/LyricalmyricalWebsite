import { describe, expect, it } from "vitest";
import { csvCell } from "./csvCell";

describe("csvCell", () => {
  it("keeps negative numbers as numbers", () => {
    expect(csvCell(-12.5)).toBe('"-12.5"');
    expect(csvCell("-35.0")).toBe('"-35.0"');
  });
  it("defuses formulas and escapes quotes", () => {
    expect(csvCell("=SUM(A1)")).toBe(`"'=SUM(A1)"`);
    expect(csvCell("-1+2")).toBe(`"'-1+2"`);
    expect(csvCell("@cmd")).toBe(`"'@cmd"`);
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('""');
  });
});
