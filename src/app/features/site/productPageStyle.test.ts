import { describe, expect, it } from "vitest";
import { productPageCss, productPageFontNames, signupBoxCss } from "./productPageStyle";
import { STYLE_GROUPS } from "../../admin/studio/styleSchema";

describe("product page (catalogue card) CSS", () => {
  it("falls back to theme tokens when no control is set", () => {
    const css = productPageCss({});
    expect(css).toContain("background:var(--surface)");
    expect(css).toContain("box-shadow:8px 8px 0 var(--accent)");
    expect(css).toContain("var(--rp-outline, rgb(var(--fg-rgb)))");
    expect(css).toContain("'DM Mono'");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("applies every buy-card control", () => {
    const css = productPageCss({
      pdpCardBg: "#111111", pdpCardBorderColor: "#222222", pdpCardBorderWidth: 4,
      pdpCardShadowColor: "#333333", pdpCardShadowOffset: 12, pdpCardPadding: 30,
      pdpTitleColor: "#444444", pdpTitleSize: 70, pdpTitleSizeMobile: 40, pdpTitleFont: "Anton", pdpTitleCase: "none",
      pdpPriceColor: "#555555", pdpPriceSize: 50, pdpMetaFont: "Archivo", pdpMetaSize: 13, pdpMetaColor: "#666666",
      pdpTabActiveBg: "#777777", pdpTabActiveText: "#888888", pdpThumbActiveColor: "#999999", pdpStockColor: "#aaaaaa",
      pdpPhotoBorderColor: "#bbbbbb", pdpPhotoBorderWidth: 0, pdpPanelBorderColor: "#cccccc", pdpCardDividerColor: "#dddddd",
    });
    for (const v of ["#111111", "#222222", "4px solid", "12px 12px 0 #333333", "padding:30px", "#444444", "font-size:70px",
      "font-size:40px", "'Anton'", "text-transform:none", "#555555", "font-size:50px", "'Archivo'", "font-size:13px",
      "#666666", "#777777", "#888888", "#999999", "#aaaaaa", "0px solid #bbbbbb", "#cccccc", "#dddddd"]) {
      expect(css, v).toContain(v);
    }
  });

  it("clamps numbers and strips CSS-breaking characters", () => {
    const css = productPageCss({ pdpCardShadowOffset: 999, pdpCardBg: "red;}body{display:none" });
    expect(css).toContain("16px 16px 0");
    expect(css).not.toContain("body{display:none");
  });

  it("lists the chosen fonts for loading", () => {
    expect(productPageFontNames({ pdpTitleFont: "Anton", pdpMetaFont: "DM Mono" })).toEqual(["Anton", "DM Mono"]);
  });

  it("every pdp key it reads has a Studio control", () => {
    const src = productPageCss.toString();
    const keys = new Set([...src.matchAll(/"(pdp[A-Za-z]+)"/g)].map((m) => m[1]));
    const controlled = new Set(STYLE_GROUPS.flatMap((g) => g.fields.map((f) => f.key)));
    expect([...keys].filter((k) => !controlled.has(k))).toEqual([]);
  });
});

describe("signupBoxCss (“Notify me” signup box)", () => {
  it("emits nothing for an untouched design, so the box keeps its built-in look", () => {
    expect(signupBoxCss({})).toBe("");
    expect(productPageCss({})).not.toContain("fm-pdp-alert");
  });

  it("turns each control into a rule on the signup box", () => {
    const css = signupBoxCss({
      pdpAlertBg: "#111111", pdpAlertBorderColor: "#ff0000", pdpAlertBorderWidth: 3, pdpAlertRadius: 12,
      pdpAlertPadding: 24, pdpAlertHeadingColor: "#00ff00", pdpAlertFieldBorderColor: "#0000ff",
      pdpAlertButtonBg: "#ffee00", pdpAlertButtonText: "#000000", pdpAlertButtonBorderColor: "#123456",
    });
    expect(css).toContain("div.fm-pdp-alert.fm-pdp-alert{background:#111111;}");
    expect(css).toContain("border-width:3px");
    expect(css).toContain("border-radius:12px !important");
    expect(css).toContain("padding:24px");
    expect(css).toContain("p.fm-pdp-alert-heading{color:#00ff00;}");
    expect(css).toContain("input.fm-pdp-alert-input{border-color:#0000ff;}");
    expect(css).toContain("button.fm-pdp-alert-btn{background:#ffee00;}");
    expect(css).toContain("button.fm-pdp-alert-btn{color:#000000;}");
    expect(css).toContain("button.fm-pdp-alert-btn{border-color:#123456;}");
    expect(productPageCss({ pdpAlertRadius: 12 })).toContain("border-radius:12px !important");
  });

  it("clamps numbers and strips CSS-breaking characters", () => {
    const css = signupBoxCss({ pdpAlertRadius: 999, pdpAlertBg: "red;}body{x:y" });
    expect(css).toContain("border-radius:32px");
    expect(css).not.toContain("}body{");
  });
});
