// Screen readers list a page by its landmarks; content outside every landmark is easy to miss (axe "region").
// The live audit of 11 Nov 2026 found two checkout parts outside them: the empty-bag message and the phone Pay bar.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("./Checkout.tsx", import.meta.url), "utf8");

describe("checkout landmarks", () => {
  it("puts the empty-bag message in the page's <main>", () => {
    expect(src).toMatch(/<main \{\.\.\.regionProps\("checkoutEmpty"\)\}/);
  });
  it("makes the phone Pay bar a landmark named by its Text & labels line", () => {
    expect(src).toMatch(/<aside \{\.\.\.regionProps\("checkoutPayBar"\)\} aria-label=\{c\("coPayBarLabel"\)\}/);
  });
});
