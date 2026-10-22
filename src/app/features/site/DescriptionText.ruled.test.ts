import { describe, expect, it } from "vitest";
import { descriptionBlocks } from "./descriptionLinks";
import { ruledBlocks } from "./DescriptionText";

describe("ruledBlocks", () => {
  it("leaves the text alone when ruled lines are off", () => {
    const b = descriptionBlocks("One\n\nTwo");
    expect(ruledBlocks(b, false)).toBe(b);
  });
  it("makes every line of plain text its own row and drops blank lines", () => {
    const rows = ruledBlocks(descriptionBlocks("Born in 1980.\n\nWorks in Toronto.\nShows widely."), true);
    expect(rows.map((r: any) => r.text)).toEqual(["Born in 1980.", "Works in Toronto.", "Shows widely."]);
  });
  it("keeps headings and lists as they are", () => {
    const rows = ruledBlocks(descriptionBlocks("## Bio\nLine\n- a\n- b"), true);
    expect(rows.map((r) => r.type)).toEqual(["h3", "text", "ul"]);
  });
});
